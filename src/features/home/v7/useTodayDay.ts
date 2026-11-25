import {useSyncExternalStore} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getApi} from '../../../data';
import {LemmaError} from '../../../data/api';
import {authGeneration,authOwner,authSignedOut,onAccountChange} from '../../../data/authBoundary';
import {getDemoProfile,getMode} from '../../../data/mode';
import {getStudyApi} from '../../../data/study';
import {dayBounds,loggedMinutes} from '../../../lib/effort';
import {overdueSummary} from '../../calendar/v7/overdue';
import {readTasks} from '../../planner/readTasks';
import {readDayPlan} from '../readDayPlan';

/** Keep the last result visible while Today refreshes. The home prefix also
 * makes schedule, task, study and review changes from the owner feed refresh it. */
export function useTodayDay(day:string,zone:string,canLoad:boolean){
 const generation=useSyncExternalStore(onAccountChange,authGeneration,authGeneration);
 const mode=getMode(),profile=mode==='demo'?getDemoProfile():null,owner=authOwner();
 const currentScope=()=>getMode()===mode&&(mode==='demo'?getDemoProfile()===profile:
  !authSignedOut()&&authOwner()===owner&&authGeneration()===generation);
 return useQuery({
  queryKey:['home','today-day',mode,profile,owner,generation,day,zone],
  enabled:canLoad&&(mode==='demo'||!authSignedOut()),
  // Revalidate on return because some local task and study writes bypass the query cache.
  staleTime:0,
  retry:false,
  queryFn:async()=>{
   if(!currentScope())throw new LemmaError('auth','Reopen Today for this account.');
   const study=getStudyApi(),range=dayBounds(day,zone);
   const [blocks,entries,plan,dues,tasks,answered]=await Promise.all([
    study.listCalendarBlocks(range),
    study.listStudyEntries(range),
    readDayPlan(day).catch(()=>null),
    import('../../calendar/deadlines/load').then(module=>module.loadCalendarDues()).catch(()=>null),
    readTasks().catch(()=>[]),
    // The live Insights read returns study-day aggregates with no raw reviews to count here.
    mode==='demo'?getApi().getInsightData(7).then(insight=>insight.reviews.filter(review=>
     Date.parse(review.reviewedAt)>=Date.parse(range.start)&&Date.parse(review.reviewedAt)<Date.parse(range.end)).length).catch(()=>0):0,
   ]);
   if(!currentScope())throw new LemmaError('auth','Reopen Today for this account.');
   const saved=entries.filter(item=>item.status==='saved').map(item=>({id:item.id,status:'saved' as const,subjectId:item.subjectId,
    intervals:item.intervals.filter(interval=>interval.end!==null).map(interval=>({start:interval.start,end:interval.end!,kind:interval.kind}))}));
   return {
    blocks:blocks.filter(block=>block.status!=='cancelled'),entries,
    logged:Math.max(0,loggedMinutes(saved,range,zone,new Date().toISOString()).minutes),closed:plan?.status==='closed',
    overdue:dues?overdueSummary({tasks,dues},zone).total:0,tasks,topics:dues?.topics??[],answered,
   };
  },
 });
}
