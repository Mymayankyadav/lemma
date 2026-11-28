"""Archive this run's measured data and selected evidence. Compact images retain their CSS pixel dimensions."""
import argparse
import io
import json
import os
import zipfile
from pathlib import Path
from PIL import Image

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--part-mb', type=float, default=45)
    limit = parser.parse_args().part_mb * 1048576
    if limit <= 0:
        parser.error('--part-mb must be positive')
    root = Path(os.environ.get('AUDIT_OUT', 'artifacts/ui-audit-2026-11-27'))
    mode = 'none' if os.environ.get('METRICS_ONLY') == '1' else os.environ.get('AUDIT_IMAGES', 'compact')
    examples = {entry[3] for entry in json.loads(Path(__file__).with_name('evidence.json').read_text())}
    profiles = sorted((root/'profiles').iterdir()) if (root/'profiles').exists() else [root]
    archive, part, images, data = None, 0, [], 0

    def add(name, payload):
        nonlocal archive, part
        if archive is None or (archive.filelist and archive.fp.tell()+len(payload) > limit):
            if archive:
                archive.close()
            part += 1
            archive = zipfile.ZipFile(root/f'ui-audit-images-{part}.zip', 'w', zipfile.ZIP_DEFLATED)
        archive.writestr(name, payload)

    try:
        for profile in profiles:
            prefix = '' if profile == root else profile.name+'/'
            for stage in ('audit', 'shots', 'keyboard', 'sweep', 'motion', 'states', 'palette'):
                for file in sorted((profile/stage).rglob('*')):
                    if not file.is_file():
                        continue
                    name = prefix+file.relative_to(profile).as_posix()
                    if file.suffix == '.json':
                        add('data/'+name, file.read_bytes())
                        data += 1
                    elif file.suffix == '.png' and mode != 'none':
                        if mode == 'compact' and ((profile != root and profile.name != 'standard') or file.relative_to(profile).as_posix() not in examples):
                            continue
                        with Image.open(file) as source:
                            im = source.convert('RGB')
                        if mode == 'all' and stage != 'motion':
                            im = im.resize((max(1,im.width//2), max(1,im.height//2)), Image.Resampling.LANCZOS)
                        payload = io.BytesIO()
                        im.save(payload, 'WEBP', quality=88, method=4)
                        target = str(Path(name).with_suffix('.webp'))
                        add(target, payload.getvalue())
                        images.append(dict(file=target, width=im.width, height=im.height, part=part))
        if (root/'run.json').exists():
            add('data/run.json', (root/'run.json').read_bytes())
        add('index.json', json.dumps(dict(mode=mode, images=images, reports=data), indent=2).encode())
    finally:
        if archive:
            archive.close()
    print(f'{len(images)} images, {data} measurement reports, {part} archive part(s)')

if __name__ == '__main__':
    main()
