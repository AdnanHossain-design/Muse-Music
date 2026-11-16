/**
 * Band power per channel, computed with our own Welch implementation.
 * Prints in the same format as eeg_fft.py so the two outputs can be compared directly.
 *
 * Usage:
 *   npx ts-node welch_validation.ts                       every CSV in Data/Sample, all channels
 *   npx ts-node welch_validation.ts file.csv --channel TP9
 */
import { parseArgs } from "util";
import { CHANNELS, assertChannel, bandPowers, loadChannel, resolveCsvFiles, welch } from "./core";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { channel: { type: "string" } },
  });
  const channels = values.channel ? [assertChannel(values.channel)] : CHANNELS;

  for (const file of resolveCsvFiles(positionals)) {
    console.log(`\n${file}`);
    for (const channel of channels) {
      console.log(`  RAW_${channel}`);
      const powers = bandPowers(welch(loadChannel(file, channel)));
      for (const [band, power] of Object.entries(powers)) console.log(`    ${band}: ${power.toFixed(2)}`);
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
