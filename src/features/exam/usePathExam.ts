import {useEffect,useMemo,useState} from 'react'
import {planExam} from '../../../supabase/functions/_shared/exam/plan'
import type {SittingChange,SittingRecord} from '../../data/exam/contract'
import {selectSitting} from '../../data/exam/contract'
import {getExamApi,useExamEvidence,useExamSnapshot,useRefreshExam} from '../../data/exam/queries'

export function usePathExam(projectId:string,slug:string,preferredId:string|null,enabled:boolean){
 const {query,owner}=useExamSnapshot(projectId,slug,enabled)
 const sitting=enabled?selectSitting(query.data,preferredId):undefined
 const evidence=useExamEvidence(sitting,owner,slug,enabled)
 const [now,setNow]=useState(Date.now)
 useEffect(()=>{
  if(!sitting)return
  const timer=window.setInterval(()=>setNow(Date.now()),30000)
  return()=>window.clearInterval(timer)
 },[sitting?.id])
 const plan=useMemo(()=>sitting&&(evidence.data||!sitting.blueprint.length)?planExam({
  sitting,now:new Date(now).toISOString(),attempts:evidence.data?.attempts??[],evidence:evidence.data?.evidence??[],
 }):undefined,[sitting,evidence.data,now])
 const refresh=useRefreshExam()
 async function change(action:SittingChange,base:SittingRecord|undefined=sitting){
  if(!base)return
  try{await getExamApi().change(base,action)}
  finally{await refresh()}
 }
 return {sitting,sittings:query.data?.sittings??[],plan,owner,now,refresh,change,pendingSetup:query.data?.pendingSetup,pendingCalendar:query.data?.pendingCalendar,loading:query.isPending,loadError:query.error??evidence.error}
}
