import {useOutlet,useLocation,useNavigationType} from 'react-router';
import {useEffect} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {getMode,getDemoProfile} from '../data/mode';
import {saveOfflineSnapshot,readOfflineSnapshot,deleteOfflineSnapshot,isOfflineKey} from '../lib/offline-cache';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import TabBar from './TabBar';
import DemoChip from './DemoChip';
import {Ground} from '../ui/Ground';
import {GraphSketch} from '../ui/backgrounds/graph/GraphSketch';
import {easeOut} from '../ui/motion';
const tabPaths=new Set(['/','/projects','/review','/insights']);
export default function AppShell(){
 const outlet=useOutlet(),location=useLocation(),navigation=useNavigationType(),reduce=!!useReducedMotion();
 const queryClient=useQueryClient();
 useEffect(()=>{
  let disposed=false,identity:string|null=null,saveTimer:ReturnType<typeof setTimeout>|null=null;
  let idleSave:number|null=null;
  let authEventSeen=false;
  // Serialize writes and deletion so a sign-out cannot resurrect a prior owner's snapshot.
  let pendingSave:Promise<void>=Promise.resolve();
  // A snapshot read can still hold an IndexedDB connection when an auth
  // switch arrives. Wait for it before deleteDatabase, otherwise onblocked
  // can leave the former owner's offline records on disk.
  const pendingReads=new Set<Promise<unknown>>();
  const eraseOwner=(owner:string)=>{
   void Promise.allSettled([pendingSave,...pendingReads])
    .then(()=>deleteOfflineSnapshot(owner)).catch(()=>{/* Private mode/blocked storage: no data is exposed to the next owner. */});
  };
  const publish=(savedAt:number|null)=>{
   if(savedAt===null)delete document.documentElement.dataset.offlineSavedAt;
   else document.documentElement.dataset.offlineSavedAt=String(savedAt);
   window.dispatchEvent(new CustomEvent('lemma:offline-snapshot',{detail:{savedAt}}));
  };
  const restore=async()=>{
   const owner=identity;
   if(!owner)return;
   const reading=readOfflineSnapshot(owner);
   pendingReads.add(reading);
   try{
    const snapshot=await reading;
    // Reading IndexedDB is asynchronous. A sign-out or account switch during
    // that read must never inject the former owner's rows into the new cache.
    if(disposed||identity!==owner)return;
    if(snapshot)for(const entry of snapshot.entries){
     if(queryClient.getQueryData(entry.key)===undefined)
      queryClient.setQueryData(entry.key,entry.data,{updatedAt:entry.savedAt});
    }
    publish(snapshot?.savedAt??null);
   }catch{if(!disposed&&identity===owner)publish(null)}
   finally{pendingReads.delete(reading)}
  };
  const save=async(allowOffline=false)=>{
   if(disposed||!identity||(!allowOffline&&!navigator.onLine))return;
   const owner=identity;
   // A queued save must not read the next account's React Query data under
   // the previous owner's ID after a rapid sign-out/account switch.
   pendingSave=pendingSave.then(()=>identity===owner&&!disposed&&(allowOffline||navigator.onLine)
    ?saveOfflineSnapshot(owner,queryClient,Date.now(),()=>!disposed&&identity===owner&&(allowOffline||navigator.onLine)):undefined)
    .catch(()=>{/* Quota/private mode: online use continues. */});
   await pendingSave;
  };
  const cancelQueuedSave=()=>{
   if(saveTimer){clearTimeout(saveTimer);saveTimer=null}
   if(idleSave!==null){window.cancelIdleCallback?.(idleSave);idleSave=null}
  };
  const queueSave=()=>{
   if(disposed||!identity||!navigator.onLine)return;
   cancelQueuedSave();
   // A 150ms snapshot serialization competed with cold React/KaTeX paint.
   // Persist after the 1500ms render budget, then when the browser is idle.
   // Sudden offline transitions flush this pending cache save immediately.
   saveTimer=setTimeout(()=>{
    saveTimer=null;
    if(typeof window.requestIdleCallback==='function')
     idleSave=window.requestIdleCallback(()=>{idleSave=null;void save()},{timeout:1500});
    else void save();
   },1750);
  };
  const onOffline=()=>{
   // Cancel a pending debounce and let any already-started online write
   // finish before reading the final immutable offline snapshot.
   const queued=saveTimer!==null||idleSave!==null;
   cancelQueuedSave();
   // Flush already-read query data to IndexedDB before restoring offline;
   // this is read-only cache persistence, not an offline mutation queue.
   const writing=queued?save(true):pendingSave;
   void writing.finally(()=>{if(!disposed&&!navigator.onLine)void restore()})
  };
  const onOnline=()=>{
   // A browser 'online' event does not prove the API is reachable. Keep a
   // restored live snapshot read-only until a newer query succeeds.
   if(getMode()==='live'&&document.documentElement.dataset.offlineSavedAt){
    void queryClient.invalidateQueries({refetchType:'active'});
    return;
   }
   publish(null);queueSave();
  };
  const unsubscribe=queryClient.getQueryCache().subscribe(event=>{
   if(event.type!=='updated'||!isOfflineKey(event.query.queryKey))return;
   if(event.query.state.status==='success'){
    // A successful fresh network read ends a stale-snapshot fallback. Merely
    // hydrating old entries must not clear the warning or re-enable writes.
    const restoredAt=Number(document.documentElement.dataset.offlineSavedAt);
    if(getMode()==='live'&&navigator.onLine&&Number.isFinite(restoredAt)&&restoredAt>0&&
       event.query.state.dataUpdatedAt>restoredAt)publish(null);
    queueSave();return
   }
   // navigator.onLine can be true during DNS/server failure. Restore only
   // when there is no live data, never after an authentication failure.
   const error=event.query.state.error as {code?:string}|null;
   if(event.query.state.status==='error'&&event.query.state.data===undefined&&
    error?.code!=='auth')void restore();
  });
  // The live Supabase client is large. Keep it in an async chunk so demo
  // cold Today does not pay its parse cost; the PWA precaches this chunk.
  const loadLiveClient=async()=>(await import('../data/live/client')).liveClient();
  let authSubscription:{unsubscribe:()=>void}|null=null;
  if(getMode()==='live')void loadLiveClient().then(client=>{
   if(disposed)return;
   authSubscription=client.auth.onAuthStateChange((event,session)=>{
      authEventSeen=true;
      if(event==='SIGNED_OUT'){
       cancelQueuedSave();
       const previous=identity;identity=null;publish(null);
       queryClient.clear(); // No signed-out route may retain the former owner's in-memory queries.
       if(previous)eraseOwner(previous);
      }else if(session?.user?.id&&session.user.id!==identity){
       const previous=identity;identity=session.user.id;publish(null);
       if(previous)queryClient.clear(); // Switching accounts must also clear live in-memory data.
       if(previous)eraseOwner(previous);
       if(!navigator.onLine)void restore();else queueSave();
      }
     }).data.subscription;
  }).catch(()=>{/* AuthGate reports missing live configuration; no snapshot is opened. */});
  void (async()=>{
   try{
    const initialIdentity=getMode()==='demo'?'demo-'+getDemoProfile():
     (await (await loadLiveClient()).auth.getSession()).data.session?.user.id??null;
    // A later SIGNED_OUT/SIGNED_IN event takes precedence over a stale getSession response.
    if(disposed||authEventSeen)return;
    identity=initialIdentity;
    if(!identity)return;
    const authError=queryClient.getQueryState(['auth'])?.error as {code?:string}|null;
    // The browser may report online while the first auth/network request
    // failed. Hydrate only this signed-in owner's read-only snapshot.
    if(!navigator.onLine||authError?.code==='offline')await restore();
    else queueSave();
   }catch{/* No authenticated identity: never open another user's snapshot. */}
  })();
  window.addEventListener('offline',onOffline);
  window.addEventListener('online',onOnline);
  return()=>{
   disposed=true;cancelQueuedSave();
   unsubscribe();authSubscription?.unsubscribe();
   window.removeEventListener('offline',onOffline);window.removeEventListener('online',onOnline);
  };
 },[queryClient]);
 const showTabs=tabPaths.has(location.pathname),fullBleed=location.pathname==='/atlas';
 const tab=showTabs,back=navigation==='POP';
 return <><Ground lamp={location.pathname==='/atlas'?'none':location.pathname.startsWith('/review')?'tr':'tl'} deep={location.pathname==='/atlas'}/>
 {fullBleed&&<DemoChip floating/>}
 <main id="main-content" style={fullBleed?undefined:{paddingTop:'calc(max(env(safe-area-inset-top), 12px) + 16px + var(--offline-banner-space, 0px))'}} className={fullBleed?'relative min-h-dvh w-full overflow-hidden':'relative mx-auto min-h-dvh max-w-[528px] px-6 pt-[calc(max(env(safe-area-inset-top),12px)+16px)] '+(showTabs?'pb-[calc(var(--tab)+env(safe-area-inset-bottom)+24px)]':'pb-6')}>
 {!fullBleed&&<DemoChip/>}
 <GraphSketch path={location.pathname}/>
 {reduce?<div key={location.pathname}>{outlet}</div>:<AnimatePresence mode="wait" initial={false}>
 <motion.div key={location.pathname} initial={fullBleed?false:reduce?{opacity:0}:tab?{opacity:0,y:8}:{opacity:0,x:back?-30:'24%'}}
 animate={fullBleed?{opacity:1}:{opacity:1,x:0,y:0,scale:1,filter:'brightness(1)'}}
 exit={fullBleed?{opacity:0}:reduce?{opacity:0}:tab?{opacity:0,y:-8}:{opacity:0,x:back?'24%':-14,scale:0.94,filter:'brightness(0.6)'}}
 transition={{duration:reduce?0.15:tab?0.2:0.36,ease:easeOut}}>
 {outlet}
 </motion.div>
 </AnimatePresence>}</main>
 {showTabs&&<TabBar/>}</>;
}
