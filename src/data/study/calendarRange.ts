import {queryOptions,useQuery,useQueryClient} from '@tanstack/react-query';
import {useSyncExternalStore} from 'react';
import {authGeneration,authOwner,authSignedOut,onAccountChange} from '../authBoundary';
import {getStudyApi} from './index';
import type {CalendarBlockRecord,StudyEntryRecord,StudyRange} from './contract';

export interface CalendarRangeData{entries:StudyEntryRecord[];blocks:CalendarBlockRecord[]}
const rangeKey='calendar-ranges';
const snapshot=()=>authGeneration();
export function useCalendarIdentity(){
 useSyncExternalStore(onAccountChange,snapshot,snapshot);
 const api=getStudyApi();
 return api.mode+':'+(authOwner()??'')+':'+authGeneration();
}
export function calendarRangeQuery(identity:string,range:StudyRange){
 return queryOptions({queryKey:[rangeKey,identity,range.start,range.end] as const,
  staleTime:30_000,refetchOnMount:'always',enabled:()=>!authSignedOut(),retry:false,
  queryFn:async():Promise<CalendarRangeData>=>{
   const api=getStudyApi();
   const [entries,blocks]=await Promise.all([api.listStudyEntries(range),api.listCalendarBlocks(range)]);
   return {entries,blocks};
  },
 });
}
export function useCalendarRange(identity:string,range:StudyRange){
 return useQuery({...calendarRangeQuery(identity,range),placeholderData:(previous,query)=>query?.queryKey[1]===identity?previous:undefined});
}
export function useCalendarRangeCache(identity:string){
 const client=useQueryClient();
 const key=[rangeKey,identity];
 return {
  refresh:()=>client.invalidateQueries({queryKey:key}),
  changeBlock:async(block:CalendarBlockRecord)=>{
   // A range fetched before this mutation must not overwrite the confirmed record.
   await client.cancelQueries({queryKey:key});
   for(const [query,data] of client.getQueriesData<CalendarRangeData>({queryKey:key})){
    if(!data)continue;
    const [,,start,end]=query;
    const found=data.blocks.some(candidate=>candidate.id===block.id);
    const within=typeof start==='string'&&typeof end==='string'&&Date.parse(block.startsAt)<Date.parse(end)&&Date.parse(block.endsAt)>Date.parse(start);
    if(!found&&!within)continue;
    const blocks=data.blocks.filter(candidate=>candidate.id!==block.id);
    if(within)blocks.push(block);
    blocks.sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
    client.setQueryData(query,{...data,blocks});
   }
   void client.invalidateQueries({queryKey:key});
  },
 };
}
