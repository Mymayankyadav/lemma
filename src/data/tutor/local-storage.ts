import {authGeneration,authOwner} from '../authBoundary'
import {getMode} from '../mode'

type Scope={ownerId:string;generation:number}
const deletedPrefix='lemma.tutor.deleted.v1:'
const deletedOwners=new Set<string>()
const listeners=new Set<()=>void>()

/** Parse the complete JSON tuple, including quoted colons, brackets and escapes. */
export function tutorStorageOwner(key:string):string|null {
 const prefix=['lemma.tutor.pending.v1:','lemma.tutor.confirmed.v1:','lemma.tutor.connector.v1:','lemma.tutor.draft:'].find(value=>key.startsWith(value))
 if(!prefix)return null
 const value=key.slice(prefix.length)
 if(value[0]!=='[')return null
 let quoted=false,escaped=false
 for(let i=1;i<value.length;i++){
  const character=value[i]
  if(escaped){escaped=false;continue}
  if(quoted&&character==='\\'){escaped=true;continue}
  if(character==='"'){quoted=!quoted;continue}
  if(quoted||character!==']')continue
  try {
   const scope:unknown=JSON.parse(value.slice(0,i+1)),suffix=value.slice(i+1)
   if(!Array.isArray(scope)||scope.length!==3||!scope.every(part=>typeof part==='string')||!scope[0])return null
   const valid=prefix==='lemma.tutor.confirmed.v1:'?suffix==='':
    (prefix==='lemma.tutor.pending.v1:'||prefix==='lemma.tutor.connector.v1:')?suffix.startsWith(':')&&suffix.length>1:
     [':question',':context',':source',':attached-local'].includes(suffix)||(suffix===':input-assist'&&scope[1]==='input'&&scope[2]==='preferences')||(suffix.startsWith(':reply:')&&suffix.length>7)
   return valid?scope[0]:null
  }catch{return null}
 }
 return null
}

export function tutorOwnerDeleted(ownerId:string):boolean {
 if(deletedOwners.has(ownerId))return true
 try {
  if(localStorage.getItem(deletedPrefix+JSON.stringify(ownerId))==='1'){
   deletedOwners.add(ownerId)
   return true
  }
 }catch{/* A denied storage API must not undo the current tab's deletion fence. */}
 return false
}

export function tutorLocalScopeActive(scope:Scope):boolean {
 return getMode()==='live'&&authOwner()===scope.ownerId&&authGeneration()===scope.generation&&!tutorOwnerDeleted(scope.ownerId)
}

export function subscribeTutorLocalCleanup(refresh:()=>void):()=>void {
 listeners.add(refresh)
 const changed=(event:StorageEvent)=>{
  if(!event.key?.startsWith(deletedPrefix))return
  try {
   const owner:unknown=JSON.parse(event.key.slice(deletedPrefix.length))
   if(typeof owner==='string'&&event.newValue==='1')deletedOwners.add(owner)
  }catch{/* Ignore malformed keys from unrelated browser storage. */}
  refresh()
 }
 window.addEventListener('storage',changed)
 return ()=>{listeners.delete(refresh);window.removeEventListener('storage',changed)}
}

/** All live writes share the account/deletion fence, including queued responses. */
export function writeTutorLocal(scope:Scope,key:string,value:string):void {
 if(tutorStorageOwner(key)!==scope.ownerId||!tutorLocalScopeActive(scope))throw new Error('The account changed. Reopen the tutor.')
 localStorage.setItem(key,value)
 // A different tab can confirm deletion between our check and this write.
 if(tutorOwnerDeleted(scope.ownerId)){
  localStorage.removeItem(key)
  throw new Error('The account changed. Reopen the tutor.')
 }
}

/** Call only after a confirmed deletion receipt for the captured current account. */
export function removeDeletedOwnerTutorData(ownerId:string,generation:number):boolean {
 if(!ownerId||getMode()!=='live'||authOwner()!==ownerId||authGeneration()!==generation)return false
 deletedOwners.add(ownerId)
 const marker=deletedPrefix+JSON.stringify(ownerId)
 let fenced=false,removed=true
 try {localStorage.setItem(marker,'1');fenced=true}catch{/* Retry after removing content if storage was full. */}
 const keys:string[]=[]
 try {
  for(let i=0;i<localStorage.length;i++){
   const key=localStorage.key(i)
   if(key&&tutorStorageOwner(key)===ownerId)keys.push(key)
  }
 }catch{removed=false}
 for(const key of keys){try {localStorage.removeItem(key)}catch{removed=false}}
 if(!fenced){try {localStorage.setItem(marker,'1');fenced=true}catch{/* The caller reports incomplete local cleanup. */}}
 for(const refresh of listeners)refresh()
 return fenced&&removed
}
