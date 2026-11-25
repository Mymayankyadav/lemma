import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {authOwner, authSignedOut, onAccountChange} from '../authBoundary'
import {readDeviceSession} from '../deviceSession'
import {getMode} from '../mode'
import {createDemoExamApi} from './demo'
import {createLiveExamApi} from './live'
import type {ExamApi, SittingRecord} from './contract'

let cached:ExamApi|undefined
export function getExamApi(){
 const mode=getMode()
 if(cached?.mode!==mode)cached=mode==='demo'?createDemoExamApi():createLiveExamApi()
 return cached
}
function examOwner() {
 return getMode()==='demo'?'demo':authSignedOut()?null:authOwner()??readDeviceSession()?.ownerId??null
}
export function useExamSnapshot(projectId:string,slug:string,enabled:boolean){
 const [owner,setOwner]=useState(examOwner)
 useEffect(()=>onAccountChange(()=>setOwner(examOwner())),[])
 const query=useQuery({
  queryKey:['exam',owner,projectId,slug], enabled:enabled&&!!owner&&!!projectId, staleTime:30_000,
  queryFn:()=>getExamApi().read(projectId,slug),
 })
 return {query,owner}
}
export function useExamEvidence(sitting:SittingRecord|undefined,owner:string|null,slug:string,enabled:boolean){
 return useQuery({
  queryKey:['exam-attempts',owner,sitting?.id,slug,sitting?.blueprint_version===undefined?'1':String(sitting.blueprint_version)],
  enabled:enabled&&!!owner&&!!sitting,staleTime:30_000,
  queryFn:()=>getExamApi().readEvidence(sitting!),
 })
}
export function useExamIdeas(projectId:string,owner:string|null,enabled:boolean){
 return useQuery({
  queryKey:['card-ideas',owner,projectId],enabled:enabled&&!!owner&&!!projectId,staleTime:30_000,
  queryFn:()=>getExamApi().readIdeas(projectId),
 })
}
export function useRefreshExam(){
 const client=useQueryClient()
 return async ()=>{await Promise.all(['exam','exam-attempts','card-ideas','deadlines','agenda'].map(key=>client.invalidateQueries({queryKey:[key]})))}
}
