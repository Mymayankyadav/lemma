"""Draw standalone plots from the synthetic Tutor ink worker sweep."""
import argparse
import csv
import json
from pathlib import Path
import subprocess

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter


COLORS = {"identity": "#9b432e", "identity-and-completion": "#315692"}
LABELS = {"identity": "Identity gate", "identity-and-completion": "Identity and completion gates"}


def draw_examples(folder, humanlike):
    with (folder / "attempts.csv").open(newline="", encoding="utf-8") as source:
        test = [row for row in csv.DictReader(source) if row["split"] == "test"]
    generator = "humanlikeTraces" if humanlike else "syntheticTraces"
    module = "tutor-ink-humanlike-fixtures.ts" if humanlike else "tutor-ink-fixtures.ts"
    geometry = subprocess.check_output([
        "node", "--input-type=module", "-e",
        f"import {{ {generator} }} from './scripts/v7/{module}'; "
        f"console.log(JSON.stringify({generator}().filter(trace => trace.split === 'test')));",
    ], text=True)
    traces = {trace["id"]: trace["strokes"] for trace in json.loads(geometry)}
    representatives = [
        ("forall", "Clear complete glyph", lambda row: float(row["bestMass"])),
        ("pi", "Difficult complete glyph", lambda row: (row["modelTopIsCorrect"] == "false", float(row["bestMass"]))),
        ("superset-or-equal", "Complete added stroke", lambda row: -float(row["margin"])),
        ("less-than", "Geometry-only complete", lambda row: row["geometryOnly"] == "true"),
        ("not-element-of-before-last-stroke", "Partial before slash", lambda row: float(row["bestMass"])),
        ("less-than-or-equal-before-last-stroke", "Partial before lower bar", lambda row: bool(json.loads(row["possibleCompletions"]))),
        ("less-or-equal-incomplete-bar", "Unfinished lower bar", lambda row: float(row["bestMass"])),
        ("short-stroke-before-equals", "Ambiguous one-stroke prefix", lambda row: len(json.loads(row["possibleCompletions"]))),
        ("mu-intended-infinity-actually-drawn", "Wrong glyph deliberately drawn", lambda row: float(row["bestMass"])),
        ("extra-stroke-across-member", "Ambiguous extra stroke", lambda row: float(row["bestMass"])),
        ("copyright-sign", "Outside the Lemma catalogue", lambda row: float(row["unknownMass"])),
        ("tiny-flick", "Tiny stray mark", lambda row: float(row["bestMass"])),
    ]
    if humanlike:
        representatives = [
            ("native-forall", "Complete quantifier", lambda row: float(row["bestMass"])),
            ("continuous-rounded-exists", "Single-stroke quantifier", lambda row: float(row["bestMass"])),
            ("one-lift-pi", "Connected π variant", lambda row: (row["modelTopIsCorrect"] == "false", float(row["bestMass"]))),
            ("short-bowed-equals", "Bowed, uneven bars", lambda row: row["geometryOnly"] == "true"),
            ("open-slash-first-empty-set", "Slash first, open loop", lambda row: -float(row["margin"])),
            ("approximately-long-and-short", "Held-out glyph family", lambda row: float(row["bestMass"])),
            ("pending-not-element-of", "Slash still to come", lambda row: float(row["bestMass"])),
            ("stopped-on-lower-mark", "Stopped on lower bar", lambda row: float(row["bestMass"])),
            ("quantifier-bar-missed", "Missed quantifier bar", lambda row: float(row["bestMass"])),
            ("member-double-slash", "Extra slash", lambda row: float(row["bestMass"])),
            ("exists-intended-forall-drawn", "Wrong glyph deliberately drawn", lambda row: float(row["bestMass"])),
            ("quick-at-sign", "Outside the catalogue", lambda row: float(row["unknownMass"])),
        ]
    fig, axes = plt.subplots(3, 4, figsize=(12.5, 9.5), layout="constrained")
    fig.get_layout_engine().set(h_pad=.12, hspace=.05)
    fig.set_facecolor("#fbfaf6")
    panel_title = "Human-like synthetic stress attempts" if humanlike else "Example synthetic ink attempts"
    fig.suptitle(panel_title, fontsize=19, x=.02, ha="left")
    fig.supxlabel("Selected held-out examples. Every panel uses the same coordinate scale. Scores are uncalibrated.",
                   fontsize=10, color="#41414b")
    for ax, (fixture, title, order) in zip(axes.flat, representatives):
        sample = max((row for row in test if row["fixture"] == fixture), key=order)
        strokes = traces[sample["id"]]
        for stroke in strokes:
            points = stroke["points"]
            ax.plot([p["x"] for p in points], [p["y"] for p in points], color="#243e66",
                    linewidth=2.4, solid_capstyle="round", marker="o" if len(points) == 1 else None)
        intended = sample["intended"].replace("-", " ") or "wait"
        best = sample["bestMapped"].replace("-", " ") or "abstain"
        ax.set_title(title, fontsize=11, loc="left", pad=6, fontweight="bold")
        ax.set(xlim=(84, 236), ylim=(116, 0), aspect="equal", xticks=[], yticks=[])
        ax.set_facecolor("#ffffff")
        for spine in ax.spines.values():
            spine.set_color("#d0d7de")
        ax.set_xlabel(f"Intended · {intended}\nTop mapped · {best}\n"
                      f"Mapped score {float(sample['bestMass']):.2f} · unmapped mass {float(sample['unknownMass']):.2f}",
                      fontsize=8, labelpad=7, loc="left")
    fig.savefig(folder / "examples.png", dpi=160)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=Path("docs/implementation/2026-11-21/ink-simulation"))
    folder = parser.parse_args().directory
    humanlike = json.loads((folder / "summary.json").read_text(encoding="utf-8")).get("corpus") == "humanlike"
    with (folder / "roc-points.csv").open(newline="", encoding="utf-8") as source:
        rows = [row for row in csv.DictReader(source) if row["split"] == "test"]

    for filename, title, x, y, xlabel, ylabel in [
        ("roc.png", "Safe and unsafe automatic insertion", "fpr", "tpr",
         "Unsafe attempts accepted", "Safe opportunities accepted"),
        ("precision-coverage.png", "Precision versus insertion coverage", "coverage", "precision",
         "All attempts accepted", "Accepted attempts that were correct"),
    ]:
        fig, ax = plt.subplots(figsize=(8.4, 5.3), layout="constrained")
        fig.set_facecolor("#fbfaf6")
        ax.set_facecolor("#fbfaf6")
        dataset = "Human-like synthetic stress set" if humanlike else "Synthetic held-out styles"
        ax.set_title(title + "\n" + dataset + " · full 411-class normalization", loc="left", pad=13)
        largest_x = 0
        for gate, label in LABELS.items():
            points = [row for row in rows if row["gate"] == gate and row[y]]
            xs = [float(row[x]) for row in points]
            ys = [float(row[y]) for row in points]
            if not xs:
                if gate == "identity-and-completion":
                    ax.text(.98, .04, "Both gates accepted zero attempts", transform=ax.transAxes,
                            ha="right", color=COLORS[gate], fontsize=9)
                continue
            largest_x = max(largest_x, max(xs))
            ax.plot(xs, ys, color=COLORS[gate], linewidth=2.5, label=label, clip_on=False)
            thresholds = [index for index, row in enumerate(points) if float(row["confidence"]) in (.50, .75, .90, .97)]
            ax.scatter([xs[i] for i in thresholds], [ys[i] for i in thresholds], color=COLORS[gate], s=25,
                       zorder=3, clip_on=False)
            if gate == "identity-and-completion":
                roc = filename == "roc.png"
                best = max(range(len(ys)), key=lambda index: ys[index] if roc else xs[index])
                info = (f"{xs[best]:.0%} unsafe · {ys[best]:.1%} safe accepted" if roc
                        else f"{xs[best]:.1%} coverage · {ys[best]:.0%} observed precision")
                ax.annotate(info, (xs[best], ys[best]),
                            xytext=(24, 4 if roc else -12), textcoords="offset points", fontsize=9, color=COLORS[gate],
                            arrowprops={"arrowstyle": "-", "color": COLORS[gate]})
        ax.set(xlabel=xlabel, ylabel=ylabel, xlim=(0, min(1, max(.03, largest_x*1.12))), ylim=(0, 1.04))
        ax.xaxis.set_major_formatter(PercentFormatter(1.0))
        ax.yaxis.set_major_formatter(PercentFormatter(1.0))
        ax.grid(alpha=.22)
        ax.spines[["top", "right"]].set_visible(False)
        ax.legend(loc="best", frameon=False)
        fig.supxlabel("Confidence sweep · margin ≥ 0.10 · unsupported mass ≤ 0.20 · dots at 0.50, 0.75, 0.90 and 0.97",
                       fontsize=9, color="#41414b")
        fig.savefig(folder / filename, dpi=160)
        plt.close(fig)
    draw_examples(folder, humanlike)


if __name__ == "__main__":
    main()
