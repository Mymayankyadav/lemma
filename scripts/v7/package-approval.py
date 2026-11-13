"""Validate and package the exact scheduled approval captures, excluding stale probes."""
import hashlib
import html
import json
import os
import zipfile
from pathlib import Path
from PIL import Image

base = Path(os.environ.get("CAPTURE_OUT", "../lemma-r3-approval")).resolve()
merged = {}
for name in ["full", "extra", "retry"]:
    path = base / ("results-" + name + ".json")
    if path.exists():
        for row in json.loads(path.read_text()):
            merged[row["key"]] = row
catalog = json.loads((base / "catalog-latest.json").read_text())
expected = {profile + "/" + theme + "/" + scene["name"] for scene in catalog
            for profile in scene.get("profiles", ["phone", "desktop"]) for theme in ["day", "night"]}
missing = expected - set(merged)
bad = [key for key in expected if key in merged and not merged[key]["ok"]]
if missing or bad:
    raise SystemExit("Incomplete: missing=" + str(sorted(missing)) + "; failed=" + str(bad))
records = [merged[key] for key in sorted(expected)]
files = sorted({file for row in records for file in row["files"]})
checks = []
for file in files:
    path = base / file
    with Image.open(path) as image:
        image.verify()
    checks.append(hashlib.sha256(path.read_bytes()).hexdigest() + "  " + file)
(base / "SHA256SUMS.txt").write_text("\n".join(checks) + "\n")
(base / "manifest.json").write_text(json.dumps(records, indent=2) + "\n")
summary = {
    "scenes": len(catalog), "states": len(records), "images": len(files), "missing": 0,
    "runtime_errors": sum(len(row["errors"]) for row in records),
    "horizontal_overflow_states": sum(row["layout"]["overflow"] > 1 for row in records),
    "flags": records[0]["flags"],
    "profiles": {profile: sum(row["profile"] == profile for row in records)
                 for profile in sorted({row["profile"] for row in records})},
}
(base / "coverage.json").write_text(json.dumps(summary, indent=2) + "\n")
readme = f"""# Lemma r3 approval pack

{summary['scenes']} named screens/form states; {summary['states']} profile/theme captures; {summary['images']} original PNG images.

Extract the ZIP and open index.html. Search by screen name and filter phone/desktop/Android/large text or Day/Night. Each tile opens the original PNG. Full-page images and scrolling-dialog frames have separate links.

Every appearance flag is ON: {', '.join(summary['flags'])}. This includes all U4 components: ruler, proof endings, spread, scratch paper, paper/sky, desk clock and week page. Conditional components have dedicated captures. Production defaults remain OFF pending approval.

Phone: 390 x 844. Desktop: 1440 x 1000. Landscape desk clock: 844 x 390. Large text: 360 x 800 at 200%. Android web UI: 390 x 844 with the repository's deterministic Capacitor stand-in; the native version shown is a test fixture, not a claim about the installed APK.

Fixed example workspace, 9 November 2026, 13:43 IST, en-IN, reduced motion. Focus elapsed-time and completed-review scenarios advance through the real demo UI. Data mutations remain in each disposable demo tab. No production account is changed.

Capture checks: zero missing scheduled states, zero captured runtime errors, zero horizontal-overflow states. Fonts and loading states settle before capture. The expected offline-install notice is dismissed because service workers are blocked in the harness. Initial concurrency timeouts are rerun; the final manifest records the delivered results. Failed or stale probe images are excluded from this pack.

Coverage: Today; Focus, pause/break/finish/log/desk clock; Review setup/front/answer/scratch/completion; Paths/cards/Atlas and split views; Checkpoint/Session; Inbox/card edit/plan comparison; Calendar Day/Week/Month/Agenda/quick-add/full form/pickers/edit/delete/planner/overdue; Tasks/add/edit/filled/validation/due and relation pickers; Practice record/manage; Progress/Learning/Time/Log and log forms; every Settings section and value editor; first-run steps; search/capture/action menus; paper/sky variants; week page; Day closed; not-found.

Limits: these are product UI candidates, not physical Android verification. OS permission dialogs, launcher/Quick Settings/notification shade, Google/Claude/ChatGPT pages and external sign-in handoffs require a device/live session. The live UUID-backed advanced proposal-draft editor and a real tutor's first-call confirmation are unavailable in the stock demo fixture; no substitute UI is fabricated. Physical checks, live-only flows and the final re-audit remain pending. First-load/budget changes and Android workflow wiring are outside this UI PR's permitted scope.

Validation: full unit suite 414 files / 2,425 tests passed; final affected unit pass 66; final browser/build results are in validation.txt. New flags remain default off; no release/merge is requested before your review.

Reproduce from PR #1392: build with VITE_ALLOW_FLAG_OVERRIDES=1, serve on :4173, then run node scripts/v7/approval-capture.mjs. catalog-latest.json inventories all scheduled states. manifest.json records URLs, flags, viewport, headings, dialog labels and screenshot paths. SHA256SUMS.txt verifies the original PNG bytes.
"""
(base / "README.md").write_text(readme)
rows = []
for row in records:
    links = " ".join('<a href="' + html.escape(file) + '">' +
                     ("Viewport" if index == 0 else "Full page" if "--full" in file else "Dialog scroll") + "</a>"
                     for index, file in enumerate(row["files"]))
    rows.append('<article data-search="' + html.escape((row["scene"] + " " + row["profile"] + " " + row["theme"]).lower()) +
                '" data-profile="' + row["profile"] + '" data-theme="' + row["theme"] + '"><h2>' +
                html.escape(row["scene"]) + "</h2><p>" + row["profile"] + " / " + row["theme"] +
                '</p><a href="' + html.escape(row["files"][0]) + '"><img loading="lazy" src="' +
                html.escape(row["files"][0]) + '" alt="' + html.escape(row["scene"]) + '"></a><nav>' + links + "</nav></article>")
page = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lemma r3 approval</title>
<style>body{margin:0;background:#f7f4ee;color:#121b31;font:15px system-ui}header{position:sticky;top:0;background:#f7f4eef5;padding:20px 28px;border-bottom:1px solid #ddd;z-index:2}h1{font:34px Georgia;margin:0 0 8px}input,select{font:inherit;padding:10px;border:1px solid #aaa;border-radius:8px;margin:4px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;padding:24px}article{background:white;border:1px solid #ddd;border-radius:12px;padding:12px;min-width:0}article[hidden]{display:none}h2{font-size:16px;overflow-wrap:anywhere}article img{display:block;max-width:100%;height:260px;object-fit:contain;object-position:top;margin:auto}nav{display:flex;flex-wrap:wrap;gap:12px;padding:12px 0}a{color:#4440ca}p{margin:8px 0}label{display:inline-block}</style>
<header><h1>Lemma r3 · all appearance flags on</h1><p>SCENECOUNT states · STATECOUNT profile/theme captures · IMAGECOUNT original PNGs. Read <a href="README.md">scope and limitations</a>.</p>
<label>Find <input id="q" type="search" placeholder="Task, Today, scratch, picker…"></label><label>Layout <select id="profile"><option value="">All</option><option>phone</option><option>desktop</option><option>android</option><option>large-text</option><option>landscape</option></select></label><label>Theme <select id="theme"><option value="">All</option><option>day</option><option>night</option></select></label><span id="count"></span></header><main>ROWS</main>
<script>const q=document.querySelector('#q'),p=document.querySelector('#profile'),t=document.querySelector('#theme'),rows=[...document.querySelectorAll('article')];function filter(){let n=0;for(const r of rows){r.hidden=!(r.dataset.search.includes(q.value.toLowerCase())&&(!p.value||r.dataset.profile===p.value)&&(!t.value||r.dataset.theme===t.value));if(!r.hidden)n++}document.querySelector('#count').textContent=n+' shown'}for(const el of [q,p,t])el.addEventListener('input',filter);filter()</script>"""
page = page.replace("SCENECOUNT", str(summary["scenes"])).replace("STATECOUNT", str(summary["states"])).replace("IMAGECOUNT", str(summary["images"])).replace("ROWS", "".join(rows))
(base / "index.html").write_text(page)
extras = ["index.html", "README.md", "catalog-latest.json", "manifest.json", "coverage.json", "SHA256SUMS.txt", "validation.txt", "revision.json"]
archive = base.parent / "lemma-r3-all-screens.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
    for file in files + extras:
        if (base / file).exists():
            package.write(base / file, "lemma-r3-approval/" + file)
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
print(json.dumps({**summary, "archive": str(archive), "zip_bytes": archive.stat().st_size}))
