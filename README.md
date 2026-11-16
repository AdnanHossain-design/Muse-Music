# Muse Music 🧠🎵

**Turn brainwaves into music.** This project records EEG (brainwave) data from a Muse S Athena headband, analyzes it with Fourier-transform methods, and converts what it finds into MIDI music.



Built as a UCF capstone project under Dr. Leinecker, as groundwork for research on generating music from brain signals.

---

## How it works

```
Muse headband ──► Mind Monitor app ──► CSV (raw EEG, 256 Hz)
                                          │
                  2-second windows ◄──────┘
                         │
          detrend → Hann window → FFT → power spectrum
                         │
       strongest frequency / power pairs (1–30 Hz)
                         │
        pitch from frequency, loudness from power
                         │
                    MIDI file ──► synthesized playback
```

Each 2-second window of brain activity becomes one chord. As the dominant rhythms in the signal change, the music changes with them.

## Quick start

**Requirements:** Node.js 18 or newer. Python 3 is only needed for the validation script.

```bash
git clone <this-repo-url>
cd <repo-folder>
npm install
pip install -r requirements.txt     # optional: only for eeg_fft.py

npx ts-node make_midi.ts            # converts every CSV in Data/Sample to MIDI
npx ts-node list_and_play.ts        # pick a file and listen
```

Generated MIDI files are written to `midi_output/`, which is git-ignored.

## Using your own recordings

1. In the **Mind Monitor** app, turn on **Constant Sampling** and select the **Raw EEG** graph type. Without these, the CSV only contains about one sample per second, which is too little to analyze.
2. Connect the Muse, record at least a few seconds, and export the CSV.
3. Put the file in a folder (for example `Data/`) and run:

```bash
npx ts-node make_midi.ts Data/my_recording.csv
```

## Commands

| Command | What it does |
|---|---|
| `npx ts-node make_midi.ts [files or folders] [--channel TP9\|AF7\|AF8\|TP10] [--out folder]` | CSV → MIDI. Prints the frequency/power pairs for every window. Defaults to `Data/Sample` and channel TP9. |
| `npx ts-node list_and_play.ts [--dir folder]` | Lists generated MIDI files and plays the one you choose. |
| `npx ts-node play_midi.ts file.mid` | Plays a single MIDI file. |
| `npx ts-node welch_validation.ts [files or folders] [--channel ...]` | Band power (delta–gamma) per channel using our own Welch implementation. |
| `python eeg_fft.py [files or folders] [--channel ...] [--labels ...] [--plot [file.png]]` | The same band-power analysis using SciPy, plus optional comparison charts. |

Settings (sample rate, window size, bands, pitch range) live in one place: the top of `core.ts`.

## From brainwaves to notes

| EEG feature | Musical result |
|---|---|
| Frequencies of the 3 strongest spectral peaks (1–30 Hz) | **Pitch**, on a log scale: 1 Hz → C3, 30 Hz → C6 |
| Power of the strongest peak, relative to the recording | **Loudness** (MIDI velocity 30–100) |
| Each 2-second window | One chord (a quarter note at 120 BPM) |

The 1–30 Hz range keeps the high-frequency noise described under [Known limitations](#known-limitations) out of the music.

Standard EEG bands used in the analysis scripts:

| Band | Range |
|---|---|
| Delta | 0.5–4 Hz |
| Theta | 4–8 Hz |
| Alpha | 8–13 Hz |
| Beta | 13–30 Hz |
| Gamma | 30–45 Hz |

## Validation

The spectrum math is checked against an independent reference. `welch_validation.ts` runs our TypeScript implementation of Welch's method, and `eeg_fft.py` runs SciPy's. Both print in the same format, so you can compare them directly:

```bash
npx ts-node welch_validation.ts > ts.txt
python eeg_fft.py > py.txt
diff ts.txt py.txt        # no output means the results match
```

`make_midi.ts` and `welch_validation.ts` share the same spectrum code in `core.ts`, so this check covers the numbers underneath the music too.

## Web demo

`Web/brainwave_music.html` is a standalone browser demo. Open it in any modern browser, drag in a Mind Monitor CSV, press **Generate music**, and it plays the result. It also lists the generated MIDI files and shows the frequency/power pairs behind them. Everything runs locally in the browser, and nothing is uploaded.

## Project structure

```
.
├── core.ts                  Settings and shared signal processing
├── make_midi.ts             CSV → MIDI
├── list_and_play.ts         List MIDI files and play one
├── play_midi.ts             MIDI → audio → system player
├── welch_validation.ts      Band power with our Welch implementation
├── eeg_fft.py               SciPy reference implementation
├── Web/
│   └── brainwave_music.html Drag-and-drop browser demo
├── Data/Sample/             Two example recordings
├── Examples/test_midi.ts    Minimal MIDI-writing example
├── requirements.txt         Python dependencies
├── package.json
└── tsconfig.json
```

## Sample data and first observations

`Data/Sample/` holds two short recordings from a Muse S Athena: one relaxed, one doing mental math. They were used as a first sanity check:

- Alpha power was lower during mental math on the ear channels (TP9, TP10), the expected pattern when someone concentrates.
- The forehead channels (AF7, AF8) showed higher power across most bands, consistent with eye movement and facial-muscle artifacts.

Each condition is a single short recording, so treat these as preliminary.

## Known limitations

- One channel is turned into music at a time (TP9 by default).
- A strong peak near 42 Hz appears in the raw spectra. It is probably muscle or movement noise, not brain activity. It is excluded from the music but not yet filtered from the analysis, and the cause hasn't been confirmed.
- Playback uses simple synthesized tones. It is tested on macOS; the Windows and Linux players are included but untested.
- The scripts assume 256 Hz raw EEG, which is the Muse default.
- Analysis is offline only. There is no live streaming yet.

## Roadmap

- Artifact filtering for muscle and eye-movement noise
- Combining all four channels into the music
- Machine-learning-based mapping from brain activity to sound
- Real-time streaming from the headband
- More recordings and participants, toward a research publication
- Sharing one analysis core between the command line and the web demo

## Troubleshooting

| Message | Fix |
|---|---|
| `only N raw samples ... Record with "Constant Sampling" on` | Re-record with Constant Sampling on and the Raw EEG graph type selected. |
| `no RAW_TP9 column. Is this a Mind Monitor export?` | Use the CSV exported by Mind Monitor, not another format. |
| `No MIDI files in midi_output` | Run `make_midi.ts` first. |
| No sound | Check your volume and that your OS has an audio player (`afplay` on macOS). |

## Built with

TypeScript and Node.js ([fft.js](https://github.com/indutny/fft.js), [csv-parse](https://csv.js.org/parse/), [midi-writer-js](https://github.com/grimmdude/MidiWriterJS), [@tonejs/midi](https://github.com/Tonejs/Midi)), and Python ([NumPy](https://numpy.org/), [SciPy](https://scipy.org/), [pandas](https://pandas.pydata.org/), [Matplotlib](https://matplotlib.org/)). Recordings are exported with the [Mind Monitor](https://mind-monitor.com/) app. This project is not affiliated with Muse, Interaxon, or Mind Monitor.

## License

To be determined with the project advisor.