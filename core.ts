import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import FFT from "fft.js";

// ---------- Settings: change them here, nowhere else ----------
export const SAMPLE_RATE = 256; // Hz (Muse raw EEG)
export const SEGMENT = 512; // samples per analysis window (2 s)
export const CHANNELS = ["TP9", "AF7", "AF8", "TP10"];
export const DEFAULT_CHANNEL = "TP9";
export const DEFAULT_DATA_DIR = "Data/Sample";
export const DEFAULT_MIDI_DIR = "midi_output";
export const BANDS: Record<string, [number, number]> = {
  Delta: [0.5, 4],
  Theta: [4, 8],
  Alpha: [8, 13],
  Beta: [13, 30],
  Gamma: [30, 45],
};
// Music mapping: frequencies in this range become pitches (keeps the ~42 Hz artifact out)
export const MIN_HZ = 1;
export const MAX_HZ = 30;
export const PEAKS_PER_WINDOW = 3;

export const FREQ_RES = SAMPLE_RATE / SEGMENT; // Hz per FFT bin
export const FREQS = Array.from({ length: SEGMENT / 2 }, (_, k) => k * FREQ_RES);

// ---------- Input ----------
export function assertChannel(channel: string): string {
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Unknown channel "${channel}". Use one of: ${CHANNELS.join(", ")}`);
  }
  return channel;
}

/** Turns a list of files and/or folders into a list of CSV files (default: the sample folder). */
export function resolveCsvFiles(inputs: string[]): string[] {
  const files: string[] = [];
  for (const target of inputs.length ? inputs : [DEFAULT_DATA_DIR]) {
    if (!fs.existsSync(target)) throw new Error(`Not found: ${target}`);
    if (fs.statSync(target).isDirectory()) {
      fs.readdirSync(target)
        .filter((f) => f.toLowerCase().endsWith(".csv"))
        .sort()
        .forEach((f) => files.push(path.join(target, f)));
    } else {
      files.push(target);
    }
  }
  if (!files.length) throw new Error("No CSV files found.");
  return files;
}

/** Reads one raw EEG channel (e.g. "TP9") from a Mind Monitor CSV export. */
export function loadChannel(file: string, channel: string): number[] {
  const column = `RAW_${channel}`;
  const records: Record<string, string>[] = parse(fs.readFileSync(file, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  if (records.length && !(column in records[0]!)) {
    throw new Error(`${file}: no ${column} column. Is this a Mind Monitor export?`);
  }
  const data: number[] = [];
  for (const record of records) {
    const value = record[column];
    if (value === undefined || value === "") continue;
    const x = parseFloat(value);
    if (!Number.isNaN(x)) data.push(x);
  }
  if (data.length < SEGMENT) {
    throw new Error(
      `${file}: only ${data.length} raw samples in ${column}. Record with "Constant Sampling" on in Mind Monitor.`
    );
  }
  return data;
}

// ---------- Signal processing ----------
// Periodic Hann window, same as SciPy's default for welch()
const HANN = Array.from({ length: SEGMENT }, (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / SEGMENT)));
const HANN_ENERGY = HANN.reduce((sum, w) => sum + w * w, 0);
const FFT_INSTANCE = new FFT(SEGMENT);

function* segments(data: number[], hop: number): Generator<number[]> {
  for (let i = 0; i + SEGMENT <= data.length; i += hop) yield data.slice(i, i + SEGMENT);
}

/** One-sided power spectral density of one segment: detrend, window, FFT, scale (matches SciPy). */
export function segmentPsd(segment: number[]): number[] {
  const mean = segment.reduce((sum, v) => sum + v, 0) / segment.length;
  const input = FFT_INSTANCE.createComplexArray();
  FFT_INSTANCE.toComplexArray(
    segment.map((v, i) => (v - mean) * HANN[i]!),
    input
  );
  const output = FFT_INSTANCE.createComplexArray();
  FFT_INSTANCE.transform(output, input);
  const psd: number[] = [];
  for (let k = 0; k < SEGMENT / 2; k++) {
    const power = (output[2 * k]! ** 2 + output[2 * k + 1]! ** 2) / (SAMPLE_RATE * HANN_ENERGY);
    psd.push(k === 0 ? power : 2 * power);
  }
  return psd;
}

/** Welch's method: average the PSD of 50%-overlapping segments (SciPy's default overlap). */
export function welch(data: number[]): number[] {
  const total = new Array<number>(SEGMENT / 2).fill(0);
  let count = 0;
  for (const segment of segments(data, SEGMENT / 2)) {
    segmentPsd(segment).forEach((p, k) => (total[k] = total[k]! + p));
    count++;
  }
  return total.map((p) => p / count);
}

/** Integrates the PSD over each EEG band (trapezoid rule). */
export function bandPowers(psd: number[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [name, [low, high]] of Object.entries(BANDS)) {
    const bins = FREQS.map((_, i) => i).filter((i) => FREQS[i]! >= low && FREQS[i]! <= high);
    let sum = 0;
    for (let j = 0; j < bins.length - 1; j++) {
      sum += ((psd[bins[j]!]! + psd[bins[j + 1]!]!) / 2) * FREQ_RES;
    }
    result[name] = sum;
  }
  return result;
}

// ---------- Music mapping ----------
export type Peak = [frequencyHz: number, power: number];
export interface Chord {
  pitches: number[];
  velocity: number;
}

/** Strongest spectral peaks as [frequency, power] pairs, limited to the musical range. */
export function topPeaks(psd: number[]): Peak[] {
  const low = Math.ceil(MIN_HZ / FREQ_RES);
  const high = Math.floor(MAX_HZ / FREQ_RES);
  const peaks: Peak[] = [];
  for (let k = low; k <= high; k++) {
    if (psd[k]! > psd[k - 1]! && psd[k]! >= psd[k + 1]!) peaks.push([FREQS[k]!, psd[k]!]);
  }
  return peaks.sort((a, b) => b[1] - a[1]).slice(0, PEAKS_PER_WINDOW);
}

/** Peak pairs for each non-overlapping 2-second window of a recording. */
export function analyzeWindows(data: number[]): Peak[][] {
  return Array.from(segments(data, SEGMENT), (segment) => topPeaks(segmentPsd(segment)));
}

// MIN_HZ -> MIDI 48 (C3), MAX_HZ -> MIDI 84 (C6), log scale
export function freqToPitch(frequency: number): number {
  return Math.round(48 + (36 * Math.log(frequency / MIN_HZ)) / Math.log(MAX_HZ / MIN_HZ));
}

/** Frequency sets pitch; the strongest peak's power (log scale, per recording) sets loudness. */
export function toChords(windows: Peak[][]): Chord[] {
  const used = windows.filter((w) => w.length > 0);
  const logPower = used.map((w) => Math.log10(w[0]![1]));
  const low = Math.min(...logPower);
  const high = Math.max(...logPower);
  return used.map((w, i) => ({
    pitches: [...new Set(w.map(([f]) => freqToPitch(f)))],
    velocity: Math.round(30 + 70 * (high > low ? (logPower[i]! - low) / (high - low) : 0.5)),
  }));
}
