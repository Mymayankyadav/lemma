"""Put each golden candidate's Night and Day captures side by side (Night left, Day right) with a label strip.
Usage: python3 scripts/v7/compose-golden.py docs/v7/golden-candidates"""
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
folder = sys.argv[1] if len(sys.argv) > 1 else "docs/v7/golden-candidates"
try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
except OSError: font = ImageFont.load_default()
for night in sorted(glob.glob(os.path.join(folder, "*-night.png"))):
    day = night.replace("-night.png", "-day.png")
    if not os.path.exists(day): continue
    a, b = Image.open(night).convert("RGB"), Image.open(day).convert("RGB")
    name = os.path.basename(night)[:-len("-night.png")]
    gap, strip = 24, 56
    if a.width > 1000:  # desktop captures: Night above Day, scaled down to keep the file reviewable
        sheet = Image.new("RGB", (a.width, a.height + b.height + gap + strip * 2), (255, 255, 255))
        sheet.paste(a, (0, strip)); sheet.paste(b, (0, strip * 2 + a.height + gap))
        draw = ImageDraw.Draw(sheet)
        draw.text((8, 12), "Night · " + name, fill=(20, 20, 30), font=font)
        draw.text((8, strip + a.height + gap + 12), "Day · " + name, fill=(20, 20, 30), font=font)
        sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    else:
        sheet = Image.new("RGB", (a.width + b.width + gap, max(a.height, b.height) + strip), (255, 255, 255))
        sheet.paste(a, (0, strip)); sheet.paste(b, (a.width + gap, strip))
        draw = ImageDraw.Draw(sheet)
        draw.text((8, 12), "Night · " + name, fill=(20, 20, 30), font=font)
        draw.text((a.width + gap + 8, 12), "Day · " + name, fill=(20, 20, 30), font=font)
    sheet.save(os.path.join(folder, "compare-" + name + ".png"), optimize=True)
    print("wrote compare-" + name + ".png", sheet.size)
