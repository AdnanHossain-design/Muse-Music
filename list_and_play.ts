/**
 * Lists generated MIDI files and plays the one you pick.
 *
 * Usage:  npx ts-node list_and_play.ts [--dir midi_output]
 */
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { parseArgs } from "util";
import { DEFAULT_MIDI_DIR } from "./core";
import { playMidi } from "./play_midi";

const { values } = parseArgs({ options: { dir: { type: "string" } } });
const dir = values.dir ?? DEFAULT_MIDI_DIR;

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mid")) : [];
if (!files.length) {
  console.log(`No MIDI files in ${dir}. Run make_midi.ts first.`);
  process.exit(0);
}

console.log("MIDI files:");
files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("\nEnter a number to play: ", (answer) => {
  rl.close();
  const choice = files[parseInt(answer, 10) - 1];
  if (!choice) {
    console.log("Invalid choice.");
    return;
  }
  playMidi(path.join(dir, choice));
});
