import sys,os,json
from PIL import Image,ImageDraw,ImageChops,ImageStat
S=os.environ.get('AUDIT_OUT','artifacts/ui-audit-2026-11-27')+'/motion'
dev=sys.argv[1];names=sys.argv[2:] or [d for d in sorted(os.listdir(f'{S}/{dev}')) if os.path.isdir(f'{S}/{dev}/{d}')]
os.makedirs(f'{S}/strips',exist_ok=True)
res=json.load(open(f'{S}/{dev}.json'))
sp=f'{S}/{dev}.summary.json'
summary=json.load(open(sp)) if os.path.exists(sp) and sys.argv[2:] else {}   # a subset run merges into the existing summary
for n in names:
    d=f'{S}/{dev}/{n}'
    if not os.path.exists(d+'/frames.json'):continue
    J=json.load(open(d+'/frames.json'))
    meta=J['frames']
    if not meta:continue
    ims=[Image.open(f"{d}/f{m['i']:03d}.jpg").convert('RGB') for m in meta]
    cold=J.get('cold',False)
    small=[i.resize((64,int(64*i.height/i.width))).convert('L') for i in ims]
    diffs=[0]+[ImageStat.Stat(ImageChops.difference(small[k],small[k-1])).mean[0] for k in range(1,len(small))]
    ts=[m['t'] for m in meta]
    if cold:
        rel=[t-ts[0] for t in ts]
    else:
        a=next((k for k in range(1,len(ts)) if diffs[k]>25),None)   # flash onset frame
        if a is None: print(n,'NO FLASH ANCHOR');continue
        # perf-now domain time of frame k = flashPerf + (ts[k]-ts[a]);  rel to input = that - t0Perf
        rel=[J['flashPerf']+(t-ts[a])-J['t0Perf'] for t in ts]
        flash_end=next((k for k in range(a+1,len(ts)) if diffs[k]>25),a)
        # blank diffs around the flash so they do not count as motion
        for k in range(a,flash_end+1):diffs[k]=0
        diffs[flash_end+1 if flash_end+1<len(diffs) else flash_end]=diffs[flash_end+1] if False else diffs[flash_end+1] if flash_end+1<len(diffs) else 0
    # frames at/after t0
    t0=0 if cold else 0
    post=[k for k in range(len(rel)) if rel[k] is not None and rel[k]>=-30]
    changed=[k for k in post if diffs[k]>0.15 and k>0]
    first=rel[changed[0]] if changed else None
    last=rel[changed[-1]] if changed else None
    animated=len(changed)>=3 and (last-first)>60 if changed else False
    summary[n]={'frames':len(ims),'changedFrames':len(changed),'firstChangeMs':first,'settleMs':last,'animated':animated,'meanDiffPeak':max(diffs) if diffs else 0}
    # pick keyframes
    targets=[-9999,40,80,120,160,240,360,520,800]
    if cold:targets=[0,100,200,400,700,1000,1500,2200]
    pick=[];
    for t in targets:
        if t==-9999:
            c=[k for k in range(len(rel)) if rel[k] is not None and rel[k]<=0]
            k=c[-1] if c else 0
        else:
            c=[k for k in range(len(rel)) if rel[k] is not None and rel[k]>=t]
            k=c[0] if c else None
        if k is not None and k not in pick:pick.append(k)
    if len(ims)<=6:pick=list(range(len(ims)))
    H=420;tiles=[]
    for k in pick:
        im=ims[k];w=int(im.width*H/im.height);tiles.append((k,im.resize((w,H),Image.LANCZOS)))
    W=sum(t.width for _,t in tiles)+8*(len(tiles)+1);sheet=Image.new('RGB',(W,H+30),(10,10,9));dr=ImageDraw.Draw(sheet);x=8
    for k,t in tiles:
        lab=('before' if rel[k] is not None and rel[k]<=0 else f'+{rel[k]:.0f}ms') if rel[k] is not None else str(k)
        if cold:lab=f'{rel[k]:.0f}ms'
        dr.text((x,8),f'{lab}  Δ{diffs[k]:.1f}',fill=(230,230,220));sheet.paste(t,(x,28));x+=t.width+8
    sheet.save(f'{S}/strips/{dev}-{n}.png')
json.dump(summary,open(f'{S}/{dev}.summary.json','w'),indent=1)
for n,v in summary.items():print(n.ljust(32),'frames',v['frames'],'changed',v['changedFrames'],'first',v['firstChangeMs'],'settle',v['settleMs'],'ANIM' if v['animated'] else 'instant/none')
