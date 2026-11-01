import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getApi} from '../../data';

/** Route and Stages already have all plan dates and checkpoint state in the
 * Project detail. Historical Insights are supplemental and should not start
 * another query while the first real Route frame is being painted.
 */
export function scheduleProjectInsightAfterPaint(run:()=>void):()=>void {
 let active=true;
 let second=0;
 let task:ReturnType<typeof setTimeout>|null=null;
 const first=requestAnimationFrame(()=>{
  if(!active)return;
  second=requestAnimationFrame(()=>{
   if(!active)return;
   task=setTimeout(()=>{
    task=null;
    if(active)run();
   },0);
  });
 });
 return ()=>{
  active=false;
  cancelAnimationFrame(first);
  if(second)cancelAnimationFrame(second);
  if(task!==null)clearTimeout(task);
 };
}

/** Same query key and freshness contract as useInsightData(30). Two callers
 * (hero and stages) share React Query's cache and one network request.
 * Cached insights remain available immediately even while enabled=false.
 */
export function useProjectInsight(){
 const [enabled,setEnabled]=useState(false);
 useEffect(()=>scheduleProjectInsightAfterPaint(()=>setEnabled(true)),[]);
 return useQuery({
  queryKey:['insights',30],
  queryFn:()=>getApi().getInsightData(30),
  staleTime:30_000,
  refetchOnWindowFocus:true,
  enabled,
 });
}
