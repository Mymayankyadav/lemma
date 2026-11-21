"""Package parity audit captures with labeled contact sheets and an offline archive."""

import argparse
from dataclasses import dataclass
from hashlib import sha256
from html import escape
from html.parser import HTMLParser
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from urllib.parse import quote, urlsplit
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageDraw, ImageFont, ImageOps


@dataclass(frozen=True)
class Frame:
    path: str
    record: dict
    data: bytes
    width: int
    height: int
    sha256: str


class BuildIndex(HTMLParser):
    def __init__(self):
        super().__init__()
        self.entries = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "script" and attributes.get("type") == "module" and attributes.get("src"):
            self.entries.append(urlsplit(attributes["src"]).path)


def checked_path(directory, relative):
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or "\\" in relative:
        raise ValueError(f"Invalid capture path {relative!r}")
    resolved = (directory / path).resolve()
    if not resolved.is_relative_to(directory):
        raise ValueError(f"Capture path outside its source folder: {relative}")
    return resolved


def legacy_provenance(index):
    parser = BuildIndex()
    html = index.read_bytes()
    parser.feed(html.decode("utf-8"))
    if not parser.entries:
        raise ValueError(f"No module entries in build index {index}")
    assets = {}
    for entry in parser.entries:
        asset = checked_path(index.parent, entry.removeprefix("/lemma/").lstrip("/"))
        assets[entry] = sha256(asset.read_bytes()).hexdigest()
    return {"indexSha256": sha256(html).hexdigest(), "buildEntries": parser.entries, "entrySha256": assets}


def collect(sources, legacy_index):
    chosen = {}
    provenance = []
    for index, directory in enumerate(sources):
        data = (directory / "manifest.json").read_bytes()
        audit = json.loads(data)
        run = {
            "id": f"{index + 1}-{directory.name}",
            "sourceCommit": audit["sourceCommit"],
            "dirty": audit["dirty"],
            "baseline": audit["baseline"],
            "capturedAt": audit["capturedAt"],
            "profiles": audit["profiles"],
            "manifestSha256": sha256(data).hexdigest(),
            "selectedRecords": 0,
        }
        provenance.append(run)
        for record in audit["records"]:
            key = tuple(record[field] for field in ("scene", "profile", "theme"))
            chosen[key] = directory, run, record
    if not chosen:
        raise ValueError("No capture records found")
    failed = ["/".join(key) for key, (_, _, row) in chosen.items() if row["ok"] is not True or row.get("errors")]
    if failed:
        raise ValueError("Selected captures failed: " + ", ".join(sorted(failed)))

    fallback = legacy_provenance(legacy_index) if legacy_index else None
    files_seen = set()
    records = []
    frames = []
    for _, (directory, run, row) in sorted(chosen.items()):
        record = {**row, "captureSource": run["id"]}
        if record.get("buildEntries"):
            record["buildEntriesSource"] = "capture"
        elif fallback:
            record.update(buildEntries=fallback["buildEntries"], buildEntriesSource="provided build index")
        else:
            raise ValueError(f"Missing build entries from {directory.name}: {row['scene']}")
        if not record["files"]:
            raise ValueError(f"No captured frames from {directory.name}: {row['scene']}")
        for path in record["files"]:
            if path in files_seen:
                raise ValueError(f"Duplicate selected frame {path}")
            files_seen.add(path)
            data = checked_path(directory, path).read_bytes()
            with Image.open(BytesIO(data)) as image:
                image.load()
                frames.append(Frame(path, record, data, image.width, image.height, sha256(data).hexdigest()))
        records.append(record)
        run["selectedRecords"] += 1
    return records, frames, provenance, fallback


def font(size, bold=False):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


def frame_label(path):
    suffix = PurePosixPath(path).stem.split("--", 1)
    if len(suffix) == 1:
        return "Viewport"
    fields = suffix[1].split("-")
    if len(fields) == 3 and fields[0] == "scroll":
        return f"Scroll {fields[1]} · step {fields[2]}"
    return suffix[1].replace("-", " ").capitalize()


def contact_sheets(frames, label, destination):
    destination.mkdir()
    margin, gap, gutter = 18, 12, 8
    area_width, area_height = 292, 632
    tile_width, tile_height = area_width + 2 * gutter, area_height + 58
    header = 90
    width = 2 * margin + 4 * tile_width + 3 * gap
    height = header + 3 * tile_height + 2 * gap + margin
    title_font, label_font, detail_font = font(28, True), font(13, True), font(12)
    sheets = []
    total = (len(frames) + 11) // 12

    for start in range(0, len(frames), 12):
        page = start // 12 + 1
        selected = frames[start:start + 12]
        end = start + len(selected)
        sheet = Image.new("RGB", (width, height), "#f1eee8")
        draw = ImageDraw.Draw(sheet)
        draw.text((margin, 18), label, font=title_font, fill="#192534")
        draw.text((margin, 56), f"Sheet {page} of {total} · frames {start + 1}–{end} of {len(frames)}",
                  font=detail_font, fill="#465162")
        for index, frame in enumerate(selected):
            row, column = divmod(index, 4)
            x = margin + column * (tile_width + gap)
            y = header + row * (tile_height + gap)
            draw.rounded_rectangle((x, y, x + tile_width - 1, y + tile_height - 1), radius=8, fill="#ffffff")
            ordinal = start + index + 1
            caption = f"{ordinal:03d}  {frame.record['scene']}"
            fitted = label_font
            if draw.textlength(caption, font=fitted) > area_width:
                fitted = font(11, True)
            draw.text((x + gutter, y + 8), caption, font=fitted, fill="#192534")
            detail = f"{frame.record['profile']} / {frame.record['theme']} · {frame_label(frame.path)}"
            draw.text((x + gutter, y + 28), detail, font=detail_font, fill="#465162")
            with Image.open(BytesIO(frame.data)) as original:
                preview = ImageOps.contain(original.convert("RGB"), (area_width, area_height), Image.Resampling.LANCZOS)
            sheet.paste(preview, (x + gutter + (area_width - preview.width) // 2, y + 49))
        filename = f"sheet-{page:02d}.webp"
        path = destination / filename
        sheet.save(path, "WEBP", quality=79, method=4)
        sheets.append({
            "file": f"contacts/{filename}",
            "firstFrame": start + 1,
            "lastFrame": end,
            "images": [frame.path for frame in selected],
            "sha256": sha256(path.read_bytes()).hexdigest(),
        })
    return sheets


def offline_index(label, records, frame_count):
    cards = []
    for row in records:
        scene, profile, theme, route = (row[key] for key in ("scene", "profile", "theme", "route"))
        searchable = " ".join([scene, scene.replace("-", " "), profile, theme, route, row.get("account", ""),
                              *row.get("layout", {}).get("headings", [])]).lower()
        original = escape(quote(row["files"][0]))
        frames = " ".join(f'<a href="{escape(quote(path))}">{escape(frame_label(path))}</a>' for path in row["files"])
        cards.append(
            f'<article data-search="{escape(searchable)}" data-profile="{escape(profile)}" data-theme="{escape(theme)}">'
            f'<h2>{escape(scene)}</h2><p>{escape(profile)} · {escape(theme)} · <code>{escape(route)}</code></p>'
            f'<a href="{original}"><img loading="lazy" src="{original}" alt="{escape(scene)} screenshot"></a>'
            f'<nav aria-label="Original frames">{frames}</nav></article>'
        )

    def options(field):
        return '<option value="">All</option>' + "".join(
            f'<option>{escape(value)}</option>' for value in sorted({row[field] for row in records})
        )

    return rf"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(label)}</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f1eee8;color:#192534;font:1rem/1.45 system-ui,sans-serif}}
header{{max-width:88rem;margin:auto;padding:1.3rem 1rem}}header h1{{margin:0}}a{{color:#194c92}}
.filters{{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:end}}
.filters label{{display:grid;gap:.25rem}}input,select{{min-height:2.75rem;font:inherit;padding:.4rem .6rem;border:1px solid #89939d;border-radius:.4rem;background:white;color:inherit}}
main{{max-width:88rem;margin:auto;padding:0 1rem 1rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr));gap:1rem}}
article{{min-width:0;padding:.8rem;background:white;border:1px solid #d0d7de;border-radius:.5rem}}
article[hidden]{{display:none}} h2{{font-size:1.05rem;margin:0;overflow-wrap:anywhere}}p{{margin:.45rem 0 .8rem}}
code{{overflow-wrap:anywhere}}article img{{width:100%;height:17rem;display:block;object-fit:contain;object-position:top}}
nav{{display:flex;flex-wrap:wrap;gap:.3rem .8rem;margin-top:.6rem}}
</style></head><body>
<header><h1>{escape(label)}</h1><p>{len(records)} captured states and {frame_count} original frames.
Open a frame for full resolution. <a href="manifest.json">Capture manifest</a> · <a href="SHA256SUMS.txt">Checksums</a></p>
<div class="filters">
<label>Search <input id="search" type="search" placeholder="Scene, feature or route"></label>
<label>Viewport <select id="profile">{options("profile")}</select></label>
<label>Theme <select id="theme">{options("theme")}</select></label>
<output id="count" aria-live="polite"></output>
</div></header>
<main>{''.join(cards)}</main>
<script>
const search = document.getElementById('search');
const profile = document.getElementById('profile');
const theme = document.getElementById('theme');
const cards = [...document.querySelectorAll('article')];
function filter() {{
  const words = search.value.trim().toLowerCase().split(/\s+/);
  let count = 0;
  for (const card of cards) {{
    card.hidden = !words.every(word => card.dataset.search.includes(word)) ||
      (profile.value !== '' && profile.value !== card.dataset.profile) ||
      (theme.value !== '' && theme.value !== card.dataset.theme);
    if (!card.hidden) count++;
  }}
  document.getElementById('count').textContent = count + ' of ' + cards.length + ' states';
}}
search.addEventListener('input', filter);
profile.addEventListener('change', filter);
theme.addEventListener('change', filter);
filter();
</script></body></html>
"""


def write_package(label, output, records, frames, sources, fallback):
    output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".parity-", dir=output) as temporary:
        staged = Path(temporary)
        sheets = contact_sheets(frames, label, staged / "contacts")
        manifest = {
            "schemaVersion": 1,
            "label": label,
            "states": len(records),
            "frames": len(frames),
            "sources": sources,
            "records": records,
            "images": {frame.path: {"sha256": frame.sha256, "bytes": len(frame.data),
                                    "width": frame.width, "height": frame.height} for frame in frames},
            "contactSheets": sheets,
        }
        if fallback:
            manifest["legacyBuildIndex"] = fallback
        manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        (staged / "manifest.json").write_bytes(manifest_bytes)
        thumbs = [
            f"### Sheet {number} · frames {sheet['firstFrame']}–{sheet['lastFrame']}\n\n"
            f"![Contact sheet {number}]({sheet['file']})"
            for number, sheet in enumerate(sheets, 1)
        ]
        gallery = (f"# {label}\n\n{len(records)} captured states and {len(frames)} original frames. "
                   "Extract the full-resolution archive and open `index.html` to search by scene, viewport, or theme. "
                   "[Full-resolution archive](screenshots.zip) · [Capture manifest](manifest.json)\n\n"
                   + "\n\n".join(thumbs) + "\n")
        (staged / "gallery.md").write_text(gallery, encoding="utf-8")
        archive_path = staged / "screenshots.zip"
        with ZipFile(archive_path, "w", ZIP_DEFLATED, compresslevel=6) as archive:
            for frame in frames:
                archive.writestr(frame.path, frame.data)
            archive.writestr("manifest.json", manifest_bytes)
            archive.writestr("index.html", offline_index(label, records, len(frames)).encode("utf-8"))
            archive.writestr("SHA256SUMS.txt", "".join(f"{frame.sha256}  {frame.path}\n" for frame in frames))
        with ZipFile(archive_path) as archive:
            invalid = archive.testzip()
            if invalid:
                raise ValueError(f"Archive validation failed for {invalid}")
            for frame in frames:
                if sha256(archive.read(frame.path)).hexdigest() != frame.sha256:
                    raise ValueError(f"Archive frame bytes changed for {frame.path}")
        (output / "contacts").mkdir(exist_ok=True)
        expected = {Path(sheet["file"]).name for sheet in sheets}
        for old in (output / "contacts").glob("sheet-*.webp"):
            if old.name not in expected:
                old.unlink()
        for sheet in sheets:
            (staged / sheet["file"]).replace(output / sheet["file"])
        for file in ("manifest.json", "gallery.md", "screenshots.zip"):
            (staged / file).replace(output / file)
    print(f"{len(records)} states, {len(frames)} original frames, {len(sheets)} contact sheets in {output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True, help="Title used on contact sheets and in the gallery")
    parser.add_argument("--output", required=True, type=Path, help="Destination for the evidence package")
    parser.add_argument("--legacy-index", type=Path, help="Verified build index.html for captures predating buildEntries")
    parser.add_argument("sources", nargs="+", type=Path, help="Capture directories in precedence order, newest last")
    args = parser.parse_args()
    try:
        sources = [source.resolve() for source in args.sources]
        output = args.output.resolve()
        if output in sources:
            raise ValueError("Use a separate output directory to preserve the source manifests")
        evidence = collect(sources, args.legacy_index.resolve() if args.legacy_index else None)
        write_package(args.label, output, *evidence)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"Could not package audit captures. {error}\n")


if __name__ == "__main__":
    main()
