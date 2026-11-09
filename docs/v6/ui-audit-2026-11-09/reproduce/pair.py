import sys
from PIL import Image, ImageDraw, ImageFont
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',26)
out,cap=sys.argv[1],sys.argv[2]; items=list(zip(sys.argv[3::2],sys.argv[4::2]))
ims=[(l,Image.open(p).convert('RGB')) for l,p in items]
W=sum(i.width for _,i in ims)+20*(len(ims)-1); H=max(i.height for _,i in ims)+130
c=Image.new('RGB',(W,H),(20,20,20)); d=ImageDraw.Draw(c)
d.text((16,14),cap,fill=(255,214,0),font=F)
x=0
for l,im in ims:
    d.text((x+16,62),l,fill=(255,255,255),font=F); c.paste(im,(x,110)); x+=im.width+20
c.save(out)
