import {formatBadgeCount} from '../../lib/text'
import {useQuery} from '@tanstack/react-query'
import {getApi} from '../../data'
import {useDeckTree} from '../../data/hooks'
import {Tex} from '../../ui/Tex'

/** Seven-day due forecast is read from the adapter's complete scheduled-card set.
 * Deck counts come from the review service, not a capped search or fabricated percentages.
 */
export function ReviewOutlook(){
 const decks=useDeckTree()
 const forecast=useQuery({queryKey:['review-forecast'],queryFn:()=>getApi().getReviewForecast(),staleTime:30_000})
 const allGroups=[...(decks.data??[])].filter(node=>node.due>0).sort((a,b)=>b.due-a.due)
 const dueTotal=allGroups.reduce((sum,node)=>sum+node.due,0)
 const top=allGroups.slice(0,4).map(({key,label,due})=>({key,label,due}))
 const tail=allGroups.slice(4)
 const groups=tail.length?[...top,{key:'other',label:`Other (${tail.length})`,due:tail.reduce((sum,node)=>sum+node.due,0)}]:top
 const weekly=forecast.data??[]
 const max=Math.max(1,...weekly.map(day=>day.due))
 return <div className="flex min-w-0 flex-col gap-4">
  {groups.length>0&&<div aria-label="Due cards by project">
   <div className="flex h-2 w-full overflow-hidden rounded-[1px] bg-fill-2" role="img"
    aria-label={groups.map(g=>g.label+': '+g.due+' due').join('; ')}>
    {groups.map((group,i)=><span key={group.key} style={{width:(100*group.due/Math.max(1,dueTotal))+'%',background:'var(--accent)',opacity:Math.max(.3,1-i*.15)}}/>)}
   </div>
   <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
    {groups.map((group,i)=><span key={group.key} className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-label text-ink-2"
     aria-label={group.label+': '+group.due+' due'}>
     <span aria-hidden="true" className="size-2 shrink-0 rounded-[1px]" style={{background:'var(--accent)',opacity:Math.max(.3,1-i*.15)}}/>
     <span className="clip-1" title={group.label} data-due-group-name><Tex source={group.label}/></span>
     <span className="shrink-0 tabular-nums text-ink-3">{formatBadgeCount(group.due)}</span>
    </span>)}
   </div>
  </div>}
  {forecast.error?<p className="text-label text-ink-3">Upcoming reviews are unavailable right now.</p>:
   forecast.isPending?<p className="text-label text-ink-3">Loading seven-day forecast…</p>:
   <div aria-label="Seven-day review forecast">
    <p className="mb-2 text-label font-medium text-ink-2">Next seven days</p>
    <div className="grid grid-cols-7 gap-1.5">
     {weekly.map(day=><div key={day.day} className="flex min-w-0 flex-col items-center gap-1">
      <span className="text-caption tabular-nums text-ink-2" title={day.due+' cards due'} aria-label={day.due+' cards due'}>{formatBadgeCount(day.due)}</span>
      <div className="flex h-10 w-full items-end justify-center bg-fill-1">
       <span aria-hidden="true" className="block w-full bg-amber" style={{height:day.due?Math.max(6,day.due/max*40)+'px':'0'}}/>
      </div>
      <span className="text-[length:var(--type-caption)] text-ink-3 tabular-nums">
       {new Date(day.day+'T12:00:00Z').toLocaleDateString('en',{weekday:'short',timeZone:'UTC'}).slice(0,2)}
      </span>
     </div>)}
    </div>
   </div>}
 </div>
}
