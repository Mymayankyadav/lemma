"""Pack the audit's images into AUDIT_OUT/ui-audit-images-<part>.zip files of at most --part-mb (default 45) each: lossy WebP at
1x CSS px (the captures themselves are 2x PNG; re-run capture.mjs for those), keyframe strips, whole-page frames for the full-catalogue devices only, keyboard states, sweep results,
palette before/after and interaction-state crops, and the metrics JSON. Whole device folders are kept together.
Usage: python3 scripts/ui-audit-2026-11-27/package.py [--part-mb 45]"""
import os,sys,json,zipfile,shutil
from multiprocessing import Pool
from PIL import Image
OUTDIR=os.environ.get('AUDIT_OUT','artifacts/ui-audit-2026-11-27');STAGE=OUTDIR+'/_zip-stage'
def full_dev(dev):
    try:return len(json.load(open(f'{OUTDIR}/audit/{dev}.json')))>=150
    except Exception:return True
def sources():
    jobs=[]
    def add(src,dst):jobs.append((src,STAGE+'/'+dst))
    shots=OUTDIR+'/shots'
    if os.path.isdir(shots):
        for dev in sorted(os.listdir(shots)):
            if not os.path.isdir(f'{shots}/{dev}'):continue
            for f in sorted(os.listdir(f'{shots}/{dev}')):
                if not f.endswith('.png') or f.startswith('_'):continue
                if f.endswith('.end.png') and not f.startswith('close-day'):continue   # end-of-scroll frames only where a defect was measured
                if f.endswith('.full.png') and not full_dev(dev):continue            # whole-page frames only for devices captured with the full catalogue
                add(f'{shots}/{dev}/{f}',f'screens/{dev}/{f[:-4]}.webp')
    for kind in ('keyboard','sweep'):
        root=f'{OUTDIR}/{kind}'
        if os.path.isdir(root):
            for dp,_,fs in os.walk(root):
                for f in fs:
                    if f.endswith('.png'):add(f'{dp}/{f}',f'{kind}/{os.path.relpath(dp,root)}/{f[:-4]}.webp'.replace('/./','/'))
    strips=OUTDIR+'/motion/strips'
    if os.path.isdir(strips):
        for f in sorted(os.listdir(strips)):
            if f.endswith('.png'):add(f'{strips}/{f}',f'motion-keyframes/{f[:-4]}.webp')
    pal=OUTDIR+'/palette'
    if os.path.isdir(pal):
        for f in sorted(os.listdir(pal)):
            if f.endswith('.png'):add(f'{pal}/{f}',f'palette-preview/{f[:-4]}.webp')
    st=OUTDIR+'/states'
    if os.path.isdir(st):
        for f in sorted(os.listdir(st)):
            if f.endswith('.png'):add(f'{st}/{f}',f'interaction-states/{f[:-4]}.webp')
    return jobs
def conv(j):
    src,dst=j;os.makedirs(os.path.dirname(dst),exist_ok=True)
    im=Image.open(src).convert('RGB')
    if '/shots/' in src or src.endswith('.png') and '/keyboard/' in src or '/sweep/' in src or '/states/' in src or '/palette/' in src:
        im=im.resize((max(1,im.width//2),max(1,im.height//2)),Image.LANCZOS)   # captures are 2x: ship 1x
    im.save(dst,'WEBP',quality=72,method=6);return os.path.getsize(dst)
if __name__=='__main__':
    shutil.rmtree(STAGE,ignore_errors=True);jobs=sources()
    with Pool(max(1,(os.cpu_count() or 2)-1)) as p:sizes=p.map(conv,jobs,chunksize=8)
    # group by top-level folder (screens/<device>, keyboard, sweep, ...) and bin-pack into parts
    part_mb=float(sys.argv[sys.argv.index('--part-mb')+1]) if '--part-mb' in sys.argv else 45
    groups={}
    for dp,_,fs in os.walk(STAGE):
        for f in fs:
            full=os.path.join(dp,f);rel=os.path.relpath(full,STAGE);parts=rel.split('/')
            key='/'.join(parts[:2]) if parts[0]=='screens' else parts[0]
            groups.setdefault(key,[]).append((full,rel))
    for kind in ('audit','keyboard','sweep','palette','motion'):
        d=f'{OUTDIR}/{kind}'
        for f in (sorted(os.listdir(d)) if os.path.isdir(d) else []):
            if f.endswith('.json'):groups.setdefault('data',[]).append((f'{d}/{f}',f'data/{kind}/{f}'))
    size=lambda g:sum(os.path.getsize(a) for a,_ in groups[g])
    bins=[]
    for g in sorted(groups,key=size,reverse=True):
        for b in bins:
            if sum(size(x) for x in b)+size(g)<=part_mb*1048576:b.append(g);break
        else:bins.append([g])
    total=0;names=[]
    for i,b in enumerate(bins,1):
        zpath=f'{OUTDIR}/ui-audit-images-{i}.zip'
        with zipfile.ZipFile(zpath,'w',zipfile.ZIP_STORED) as z:
            for g in b:
                for full,rel in groups[g]:z.write(full,rel)
        mb=os.path.getsize(zpath)/1048576;total+=mb;names.append((zpath,mb,b))
        print(f'{os.path.basename(zpath)}: {mb:.1f} MB  <- '+', '.join(b))
    shutil.rmtree(STAGE,ignore_errors=True)
    print(len(jobs),'images in',len(bins),'zip files,',f'{total:.1f} MB total')
