import {useQuery} from '@tanstack/react-query'
import {getApi} from '../../data'
import {forecastDueCount,hasNonzeroForecast} from './reviewForecast'

/** Compact seven-day spark beside the Review action. The forecast comes from
 * the complete scheduled-card set, not a capped search or fabricated data.
 * No separate chart or per-project stacked bar on the quiet Today screen.
 */
export function ReviewOutlook({quiet=false}:{quiet?:boolean}={}){
 const forecast=useQuery({queryKey:['review-forecast'],queryFn:()=>getApi().getReviewForecast(),staleTime:30_000})
 // The S/X browser fixture paints adjacent nonzero days without changing the
 // actual demo store, network requests, or any live forecast. This tests the
 // hardest seven-bar geometry rather than a single painted bar.
 const params=typeof window==='undefined'?null:new URLSearchParams(window.location.search)
 const adjacentFixture=params?.get('reviewSparkFixture')==='adjacent'&&
  (params.get('demo')==='stress'||params.get('demo')==='extreme')
 const weekly=adjacentFixture?(forecast.data??[]).map((day,i)=>i<2?
  {...day,due:Math.max(1,forecastDueCount(day.due))}:day):(forecast.data??[])
 const max=Math.max(1,...weekly.map(day=>forecastDueCount(day.due)))
 if(forecast.error)return quiet?null:<p className="text-caption text-ink-3">Forecast unavailable</p>
 if(forecast.isPending)return quiet?null:<p className="text-caption text-ink-3">Loading forecast…</p>
 if(!hasNonzeroForecast(weekly))return null
 return <div aria-label="Seven-day review forecast" className="min-w-0 flex-1">
  <p className="sr-only">Next seven days</p>
  <div className="grid grid-cols-7 gap-2" role="group" aria-label="Due cards over the next seven days">
   {weekly.map((day,i)=>{
    const due=forecastDueCount(day.due)
    return <div key={day.day} className="flex min-w-0 flex-col items-center gap-1">
     <span className="sr-only" aria-label={due+' cards due'}>{due} cards due</span>
     <div className="flex h-10 w-full items-end justify-center" aria-hidden="true">
      <span data-review-spark-bar="" className="block w-full max-w-[10px] rounded-t-[1px]" style={{
       height:due?Math.max(6,due/max*40)+'px':'0',
       background:i===0?'var(--accent)':'var(--ink-2)',
       opacity:i===0?1:0.65
      }}/>
     </div>
     <span className="text-caption text-ink-3" aria-hidden="true">
      {new Date(day.day+'T12:00:00Z').toLocaleDateString('en',{weekday:'short',timeZone:'UTC'}).slice(0,2)}
     </span>
    </div>
   })}
  </div>
 </div>
}
