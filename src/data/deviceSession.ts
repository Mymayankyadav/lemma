import {onAccountChange} from './authBoundary'
import {supabaseUrl} from './env'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

// Match the Supabase client's existing storage key so installed copies keep their sessions.
function authStorageKey(): string | null {
 try {return supabaseUrl ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token` : null}
 catch {return null}
}

/** Identify the saved notebook on this device. The SDK still owns tokens and server access. */
export function readDeviceSession(): {ownerId:string;sessionId:string} | null {
 const key=authStorageKey()
 if (!key) return null
 try {
  const stored=JSON.parse(localStorage.getItem(key) ?? 'null')
  const ownerId=stored?.user?.id
  if (typeof ownerId!=='string' || !uuid.test(ownerId) || typeof stored.access_token!=='string') return null
  const payload=stored.access_token.split('.')[1]
  const claims=JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')))
  if (claims.sub!==ownerId || typeof claims.session_id!=='string' || !uuid.test(claims.session_id)) return null
  return {ownerId,sessionId:claims.session_id}
 } catch {return null}
}

export function subscribeDeviceSession(change:()=>void):()=>void {
 const key=authStorageKey()
 const unsubscribe=onAccountChange(change)
 const onStorage=(event:StorageEvent)=>{if(event.key===null || event.key===key)change()}
 window.addEventListener('storage',onStorage)
 return ()=>{unsubscribe();window.removeEventListener('storage',onStorage)}
}
