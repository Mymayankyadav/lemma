import os
import json,collections
S=os.environ.get('AUDIT_OUT','artifacts/ui-audit-2026-11-27')+'/audit'
devs=['phone-p','phone-s','phone-l','ipad-p','ipad-l']
D={d:json.load(open(f'{S}/{d}.json')) for d in devs}
ids=[k for k in D['phone-p'] if k not in('close-day-1','close-day-2','close-day-3')]
print('scenes',len(ids),{d:len(D[d]) for d in devs})
# errors / step failures
for d in devs:
    for k,v in D[d].items():
        if v.get('error') or v.get('stepsFailed'):print('FAIL',d,k,v.get('error'),v.get('stepsFailed'))
# focus ring on heading
print('\n== programmatic focus ring on page heading (focusVisible && tabindex=-1)')
for d in devs:
    n=[k for k,v in D[d].items() if v.get('metrics',{}).get('focus') and v['metrics']['focus']['focusVisible'] and v['metrics']['focus'].get('outline')]
    kinds=collections.Counter(D[d][k]['metrics']['focus']['el'].split('.')[0] for k in n)
    print(d,len(n),'of',len(D[d]),dict(kinds))
print(' sample phone-p:',[ (k,D['phone-p'][k]['metrics']['focus']['el']) for k in D['phone-p'] if D['phone-p'][k].get('metrics',{}).get('focus',{}).get('focusVisible')][:60])
# pink edges
print('\n== scenes with pink border/outline elements, per device')
for d in devs:
    n=[k for k,v in D[d].items() if v.get('metrics',{}).get('pinkEdgeCount',0)>0]
    print(d,len(n))
# overflow
print('\n== horizontal overflow')
for d in devs:
    n=[(k,v['metrics']['overflowOffenders'][:2]) for k,v in D[d].items() if v.get('metrics',{}).get('overflowX')]
    print(d,len(n),n[:6])
# targets
print('\n== tap targets <44 (sum of scenes with >0 / total under44 / under32)')
for d in devs:
    ms=[v['metrics']['targets'] for v in D[d].values() if v.get('metrics')]
    print(d,sum(1 for m in ms if m['under44']),sum(m['under44'] for m in ms),sum(m['under32'] for m in ms))
# contrast
print('\n== text contrast fails (<4.5 normal/<3 large)')
for d in devs:
    ms=[(k,v['metrics']['text']) for k,v in D[d].items() if v.get('metrics')]
    print(d,'scenes with fails',sum(1 for k,t in ms if t['fail']),'total fails',sum(t['fail'] for k,t in ms),'of',sum(t['count'] for k,t in ms),'| median-of-medians',sorted(t['median'] for k,t in ms if t['median'])[len(ms)//2],'| tiny<12px',sum(t['tiny'] for k,t in ms))
allw=collections.Counter()
for d in devs:
    for k,v in D[d].items():
        for w in v.get('metrics',{}).get('text',{}).get('worst',[]):allw[(w['fg'],w['bg'],w['ratio'])]+=1
print('worst combos',allw.most_common(12))
# layers
print('\n== layer separation')
for d in devs:
    ms=[v['metrics']['layers'] for v in D[d].values() if v.get('metrics')]
    print(d,'median surface ratio',sorted(m['medianSurface'] for m in ms if m['medianSurface'])[len(ms)//2],'median border',sorted(m['medianBorder'] for m in ms if m['medianBorder'])[len(ms)//2],'weak elems',sum(m['weakSeparation'] for m in ms))
# end clear
print('\n== content hidden behind fixed bar at end of scroll (clearance<8px)')
for d in devs:
    n=[(k,v['endClear']['clearance']) for k,v in D[d].items() if v.get('endClear') and v['endClear']['clearance'] is not None and v['endClear']['clearance']<8]
    print(d,len(n),n[:10])
# near-miss
print('\n== alignment near misses (scenes)')
for d in devs:
    n=[(k,v['metrics']['alignment']['nearMisses'][:3]) for k,v in D[d].items() if v.get('metrics',{}).get('alignment',{}).get('nearMisses')]
    print(d,len(n))
# clipped
print('\n== clipped text')
for d in devs:
    n=[(k,v['metrics']['clipped'][:2]) for k,v in D[d].items() if v.get('metrics',{}).get('clipped')]
    print(d,len(n),n[:5])
# console errors
print('\n== console errors',[(d,k,v['consoleErrors']) for d in devs for k,v in D[d].items() if v.get('consoleErrors')][:8])
