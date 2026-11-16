/**
 * Turns Mind Monitor recordings into MIDI files.
 *
 * Usage:
 *   npx ts-node make_midi.ts                         every CSV in Data/Sample
 *   npx ts-node make_midi.ts path/to/file.csv        one file (or a folder)
 *   npx ts-node make_midi.ts --channel AF7 --out my_midi
 */
import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "util";
import {
  DEFAULT_CHANNEL,
  DEFAULT_MIDI_DIR,
  analyzeWindows,
  assertChannel,
  loadChannel,
  resolveCsvFiles,
  toChords,
} from "./core";

const MidiWriter = require("midi-writer-js");

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      channel: { type: "string" },
      out: { type: "string" },
    },
  });
  const channel = assertChannel(values.channel ?? DEFAULT_CHANNEL);
  const outDir = values.out ?? DEFAULT_MIDI_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  for (const file of resolveCsvFiles(positionals)) {
    const windows = analyzeWindows(loadChannel(file, channel));

    // The frequency/power pairs behind the music
    windows.forEach((peaks, i) => {
      const pairs = peaks.map(([f, p]) => `${f.toFixed(1)} Hz / ${p.toExponential(1)}`).join(" | ");
      console.log(`Window ${i + 1}:`, pairs);
    });

    const track = new MidiWriter.Track();
    for (const { pitches, velocity } of toChords(windows)) {
      track.addEvent(new MidiWriter.NoteEvent({ pitch: pitches, duration: "4", velocity }));
    }

    const suffix = channel === DEFAULT_CHANNEL ? "" : `_${channel}`;
    const outPath = path.join(outDir, path.basename(file, path.extname(file)) + suffix + ".mid");
    fs.writeFileSync(outPath, Buffer.from(new MidiWriter.Writer(track).buildFile()));
    console.log(`${file}: ${windows.length} windows -> ${outPath}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
