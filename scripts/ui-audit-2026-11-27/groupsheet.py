import sys,json,os
from PIL import Image,ImageDraw
S=os.environ.get('AUDIT_OUT','artifacts/ui-audit-2026-11-27')
sys.path.insert(0,S)
dev,out,scale=sys.argv[1],sys.argv[2],float(sys.argv[3]);ids=sys.argv[4:]
ims=[]
for i in ids:
    f=f'{S}/shots/{dev}/{i}.png'
    if os.path.exists(f):
        im=Image.open(f).convert('RGB');ims.append((i,im.resize((int(im.width*scale),int(im.height*scale)),Image.LANCZOS)))
pad=8;lab=18
H=max(i.height for _,i in ims)+lab;W=sum(i.width for _,i in ims)+pad*(len(ims)+1)
sh=Image.new('RGB',(W,H),(8,8,7));d=ImageDraw.Draw(sh);x=pad
for n,i in ims:
    d.text((x,3),n,fill=(225,225,215));sh.paste(i,(x,lab));x+=i.width+pad
sh.save(out)
