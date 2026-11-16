"""Reference implementation: band power per channel using SciPy's Welch method.

The TypeScript port (core.ts / welch_validation.ts) is validated against this script.
Both print in the same format, so their outputs can be compared directly.

Usage:
    python eeg_fft.py                          every CSV in Data/Sample, all channels
    python eeg_fft.py a.csv b.csv              specific files (or folders)
    python eeg_fft.py a.csv --channel TP9      one channel only
    python eeg_fft.py a.csv b.csv --labels Relaxed "Mental Math" --plot
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import signal

SAMPLE_RATE = 256  # Hz (Muse raw EEG)
SEGMENT = SAMPLE_RATE * 2  # samples per window (2 s)
CHANNELS = ["TP9", "AF7", "AF8", "TP10"]
DEFAULT_DATA_DIR = "Data/Sample"
BANDS = {
    "Delta": (0.5, 4),
    "Theta": (4, 8),
    "Alpha": (8, 13),
    "Beta": (13, 30),
    "Gamma": (30, 45),
}


def resolve_csv_files(inputs):
    """Turn a list of files and/or folders into a list of CSV files."""
    files = []
    for target in inputs or [DEFAULT_DATA_DIR]:
        path = Path(target)
        if not path.exists():
            raise SystemExit(f"Not found: {target}")
        files += sorted(path.glob("*.csv")) if path.is_dir() else [path]
    if not files:
        raise SystemExit("No CSV files found.")
    return files


def band_powers(file, channel):
    """Integrated Welch power in each EEG band for one channel of a recording."""
    column = f"RAW_{channel}"
    df = pd.read_csv(file)
    if column not in df:
        raise SystemExit(f"{file}: no {column} column. Is this a Mind Monitor export?")
    data = df[column].dropna().values
    if len(data) < SEGMENT:
        raise SystemExit(
            f"{file}: only {len(data)} raw samples in {column}. "
            'Record with "Constant Sampling" on in Mind Monitor.'
        )
    freqs, psd = signal.welch(data, fs=SAMPLE_RATE, nperseg=SEGMENT)
    return {
        band: float(np.trapezoid(psd[(freqs >= low) & (freqs <= high)], freqs[(freqs >= low) & (freqs <= high)]))
        for band, (low, high) in BANDS.items()
    }


def plot(results, labels, channels, out_path):
    """Grouped bar chart of band power: one panel per channel, one bar per recording."""
    import matplotlib.pyplot as plt

    cols = 2 if len(channels) > 1 else 1
    rows = -(-len(channels) // cols)
    fig, axes = plt.subplots(rows, cols, figsize=(6 * cols, 4 * rows), squeeze=False)
    x = np.arange(len(BANDS))
    width = 0.8 / len(results)
    flat = axes.flatten()
    for ax, channel in zip(flat, channels):
        for i, (result, label) in enumerate(zip(results, labels)):
            offset = (i - (len(results) - 1) / 2) * width
            ax.bar(x + offset, [result[channel][b] for b in BANDS], width, label=label)
        ax.set_yscale("log")
        ax.set_xticks(x)
        ax.set_xticklabels(list(BANDS))
        ax.set_title(f"RAW_{channel}")
        ax.legend()
    for ax in flat[len(channels):]:
        ax.set_visible(False)
    fig.suptitle("EEG band power by channel")
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    print(f"\nSaved plot: {out_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", help="CSV files or folders (default: Data/Sample)")
    parser.add_argument("--channel", choices=CHANNELS, help="one channel only (default: all four)")
    parser.add_argument("--labels", nargs="+", help="plot labels, one per file (default: file names)")
    parser.add_argument("--plot", nargs="?", const="band_comparison.png", metavar="PNG",
                        help="save a comparison chart (default file: band_comparison.png)")
    args = parser.parse_args()

    files = resolve_csv_files(args.files)
    channels = [args.channel] if args.channel else CHANNELS
    labels = args.labels or [Path(f).stem for f in files]
    if len(labels) != len(files):
        raise SystemExit(f"Got {len(labels)} labels for {len(files)} files.")

    results = []
    for file in files:
        print(f"\n{file}")
        result = {}
        for channel in channels:
            result[channel] = band_powers(file, channel)
            print(f"  RAW_{channel}")
            for band, power in result[channel].items():
                print(f"    {band}: {power:.2f}")
        results.append(result)

    if args.plot:
        plot(results, labels, channels, args.plot)


if __name__ == "__main__":
    main()
