import {regularPolygon,roundEdges} from './polygon'

interface AnswerLike {card:{cardId:string};rating:number}
export interface PolygonProgressProps {
 total:number
 order:readonly string[]
 currentCardId:string|null
 answers:readonly AnswerLike[]
}

/** Each edge is a card's first pass; an Again stays dashed until recalled. */
export function PolygonProgress({total,order,currentCardId,answers}:PolygonProgressProps){
 const count=Math.max(1,total),compact=count>24,vertices=compact?[]:regularPolygon(count)
 const states=roundEdges(order,answers)
 const currentIndex=currentCardId?order.indexOf(currentCardId):-1
 const missed=states.filter(s=>s==='missed').length
 const point=(angle:number)=>({x:36+27*Math.cos(angle),y:36+27*Math.sin(angle)})
 const segment=(i:number)=>{
  if(count>=3){
   const a=vertices[i],b=vertices[(i+1)%count]
   return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  }
  const start=-Math.PI/2+2*Math.PI*i/count
  const mid=start+Math.PI/count,end=start+2*Math.PI/count
  const a=point(start),b=point(mid),c=point(end)
  // Two arcs handle the full circle as well as the two semicircles.
  return `M ${a.x} ${a.y} A 27 27 0 0 1 ${b.x} ${b.y} A 27 27 0 0 1 ${c.x} ${c.y}`
 }

 if(compact){
  const answered=new Set(answers.map(a=>a.card.cardId)).size;
  const arc=(index:number,portion=1)=>{
   const start=-Math.PI/2+2*Math.PI*index/12+0.045;
   const end=start+(2*Math.PI/12-0.09)*Math.max(0,Math.min(1,portion));
   const a=point(start),b=point(end);
   return `M ${a.x} ${a.y} A 27 27 0 0 1 ${b.x} ${b.y}`;
  };
  const complete=12*answered/count;
  return <div className="flex min-w-0 items-center justify-center gap-2" aria-label="Round progress">
   <svg viewBox="0 0 72 72" width="58" height="58" role="img" aria-label={`${answered} of ${count} reviewed, missed ${missed}`}>
    {Array.from({length:12},(_,i)=><g key={i}>
     <path d={arc(i)} fill="none" stroke="var(--line)" strokeWidth="5" data-review-segment="pending"/>
     {complete>i&&<path d={arc(i,complete-i)} fill="none" stroke="var(--accent)" strokeWidth="5" data-review-segment="filled"/>}
    </g>)}
   </svg>
   <span className="shrink-0 font-math text-label tabular-nums text-ink-2">{answered} / {count}</span>
   <span className="shrink-0 text-caption text-ink-3">missed {missed}</span>
  </div>;
 }
 return <div className="flex min-w-0 items-center justify-center gap-2" aria-label="Round progress">
  <svg viewBox="0 0 72 72" width="58" height="58" role="img"
   aria-label={`${Math.min(Math.max(currentIndex+1,1),count)} of ${count} cards; ${missed} awaiting another pass`}>
   {Array.from({length:count},(_,i)=>{
    const state=states[i]??'pending'
    return <path key={i} d={segment(i)} data-review-edge={state} fill="none"
     stroke={state==='passed'?'var(--accent)':state==='missed'?'var(--bad)':'var(--line)'}
     strokeWidth={state==='pending'?1.5:2.5} strokeDasharray={state==='missed'?'3 3':undefined}
     strokeLinecap="round"/>
   })}
   {vertices.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={i===currentIndex?4.3:2}
    data-review-vertex={i===currentIndex?'current':'other'}
    fill={i===currentIndex?'var(--accent)':'var(--ink-3)'}/>)}
  </svg>
  <span className="shrink-0 font-math text-label tabular-nums text-ink-2">
   {Math.min(Math.max(currentIndex+1,1),count)}/{count}
  </span>
 </div>
}
