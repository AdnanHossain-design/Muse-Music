/**
 * Plays a MIDI file as simple synthesized tones.
 *
 * Usage:  npx ts-node play_midi.ts path/to/file.mid
 * (list_and_play.ts imports playMidi from here.)
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

const { Midi } = require("@tonejs/midi");

const SR = 44100; // audio sample rate

/** Renders every note in a MIDI file to a mono 16-bit WAV. */
export function renderWav(midiFile: string): { wav: Buffer; noteCount: number } {
  const midi = new Midi(fs.readFileSync(midiFile));
  const notes: any[] = midi.tracks.flatMap((track: any) => track.notes);
  const seconds = Math.max(0, ...notes.map((n) => n.time + n.duration));
  const samples = new Float32Array(Math.ceil((seconds + 0.5) * SR));

  for (const n of notes) {
    const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
    const start = Math.floor(n.time * SR);
    const len = Math.floor(n.duration * SR);
    for (let i = 0; i < len; i++) {
      const env = Math.min(1, i / (0.01 * SR), (len - i) / (0.05 * SR));
      samples[start + i] =
        (samples[start + i] ?? 0) + 0.3 * n.velocity * env * Math.sin((2 * Math.PI * freq * i) / SR);
    }
  }

  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return { wav: Buffer.concat([header, data]), noteCount: notes.length };
}

/** Renders a MIDI file and plays it with the system audio player. */
export function playMidi(midiFile: string): void {
  const { wav, noteCount } = renderWav(midiFile);
  const wavPath = path.join(os.tmpdir(), "muse-music-playback.wav");
  fs.writeFileSync(wavPath, wav);
  console.log(`Playing ${midiFile} (${noteCount} notes)...`);

  const [cmd, ...args] =
    process.platform === "darwin"
      ? ["afplay", wavPath]
      : process.platform === "win32"
        ? ["powershell", "-c", `(New-Object Media.SoundPlayer '${wavPath}').PlaySync()`]
        : ["aplay", wavPath];
  execFileSync(cmd!, args, { stdio: "inherit" });
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx ts-node play_midi.ts <file.mid>");
    process.exit(1);
  }
  playMidi(file);
}
