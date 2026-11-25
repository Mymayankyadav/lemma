import {useLayoutEffect} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {authGeneration,authOwner,authSignedOut,onAccountChange} from '../data/authBoundary'
import {readDeviceSession} from '../data/deviceSession'
import {clearOfflineHandoff,deleteOfflineSnapshot,hydrateOfflineSnapshot,isOfflineKey,saveOfflineSnapshot,stageOfflineHandoff} from '../lib/offline-cache'

export function useNotebookSnapshot(owner:string):void {
 const client=useQueryClient()
 useLayoutEffect(()=>{
  const session=readDeviceSession()
  if(session?.ownerId!==owner)return
  let active=true
  const canRead=()=>{
   if(!active||authSignedOut()||(authOwner()&&authOwner()!==owner))return false
   const current=readDeviceSession()
   return current?.ownerId===owner&&current.sessionId===session.sessionId
  }
  const sameOwnerKey=(key:readonly unknown[])=>key[0]!=='exam'&&key[0]!=='exam-attempts'||key[1]===owner
  // Settings in the snapshot are a small projection, not a complete Settings response.
  void hydrateOfflineSnapshot(owner,client,Date.now(),{canHydrate:canRead,acceptKey:key=>key[0]!=='settings'&&sameOwnerKey(key)})
  const unwatch=client.getQueryCache().subscribe(event=>{
   if(event.type!=='updated'||event.action.type!=='success'||event.action.manual)return
   const {queryKey,state}=event.query
   if(!isOfflineKey(queryKey)||!sameOwnerKey(queryKey)||authOwner()!==owner||!canRead())return
   const generation=authGeneration(),canWrite=()=>canRead()&&authGeneration()===generation
   stageOfflineHandoff(owner,queryKey,state.data,state.dataUpdatedAt)
   void saveOfflineSnapshot(owner,client,Date.now(),canWrite).catch(()=>undefined)
  })
  const unfence=onAccountChange(user=>{
   if(user?.id===owner)return
   active=false
   clearOfflineHandoff(owner)
   void deleteOfflineSnapshot(owner).catch(()=>undefined)
  })
  return ()=>{active=false;unwatch();unfence()}
 },[client,owner])
}
