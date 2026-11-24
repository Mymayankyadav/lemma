import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getApi } from '../data'
import { authOwner, authSignedOut } from '../data/authBoundary'
import { readDeviceSession, subscribeDeviceSession } from '../data/deviceSession'
import { useAuth } from '../data/hooks'
import { getMode } from '../data/mode'
import { Button } from '../ui/Button'
import { useOnline } from '../ui/v7/savedCopy'
import { useNotebookSnapshot } from './useNotebookSnapshot'

/** Accept only local hash-router destinations; never return to the sign-in loop. */
function destination(value: string | null | undefined): string | null {
 if (!value) return null
 const path = value.replace(/^#/, '')
 return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') &&
  path.split(/[?#]/)[0] !== '/sign-in' ? path : null
}
function returnHint(key: string): string | null {
 try {return sessionStorage.getItem(key)} catch {return null}
}
function storedOwner(): string | null {return readDeviceSession()?.ownerId ?? null}
function setupReceipt(owner:string): string | null {
 const session=readDeviceSession()
 if(session?.ownerId!==owner)return null
 return JSON.stringify([owner, session.sessionId, Intl.DateTimeFormat().resolvedOptions().timeZone])
}
const setupKey='lemma:device-setup'

function ReadyGate({children, owner, returning, confirmed}: {children: ReactNode; owner: string; returning: boolean; confirmed: boolean}) {
 const location = useLocation(), navigate = useNavigate(), queryClient = useQueryClient()
 const online=useOnline(), receipt=setupReceipt(owner)
 const [target] = useState(() =>
  destination(returnHint('lemma:sign-in-return')) ??
  destination(returnHint('lemma:oauth-return')) ??
  destination((location.state as {from?: string} | null)?.from) ??
  destination(location.pathname + location.search) ?? '/')
 const [restored, setRestored] = useState(false)
 const alreadySetup=(()=>{try{return !!receipt&&localStorage.getItem(setupKey)===receipt}catch{return false}})()
 useNotebookSnapshot(owner)
 // Bootstrap is idempotent. Share a single request across StrictMode remounts and
 // route changes. Once setup succeeds, keep that result for this session and time zone.
 const setup = useQuery({queryKey: ['bootstrap', owner], queryFn: () => getApi().bootstrap(),
  enabled: confirmed && online && (!returning || !alreadySetup),
  staleTime: Infinity, retry: false, refetchOnWindowFocus: false})
 useEffect(() => {
  if (!setup.isSuccess || restored || authSignedOut() || (authOwner() && authOwner()!==owner)) return
  // Bootstrap already returns Settings; seed the normal query before Home mounts.
  if ((queryClient.getQueryState(['settings'])?.dataUpdatedAt ?? 0) <= setup.dataUpdatedAt)
   queryClient.setQueryData(['settings'], setup.data)
  try {if (receipt && receipt===setupReceipt(owner)) localStorage.setItem(setupKey,receipt)} catch {/* Setup still succeeds in memory. */}
  if (!returning) {
   try {
    sessionStorage.removeItem('lemma:sign-in-return')
    sessionStorage.removeItem('lemma:oauth-return')
   } catch {/* The in-memory return route is still available. */}
   const url = new URL(window.location.href)
   url.searchParams.delete('code')
   window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
   void navigate(target, {replace: true})
  }
  setRestored(true)
 }, [setup.isSuccess, setup.data, setup.dataUpdatedAt, restored, owner, receipt, returning, navigate, target, queryClient])
 if (returning) return children
 if (!online && !restored) return <p role="status" className="p-6 text-ink-2">Connect to finish signing in.</p>
 if (setup.isError) return <section className="p-6 text-ink-2">
  <p role="alert">Couldn't finish sign-in. Your study data hasn't loaded.</p>
  <Button className="mt-4" onClick={() => void setup.refetch()}>Try again</Button>
 </section>
 if (!setup.isSuccess || !restored) return <p role="status" className="p-6 text-ink-2">Finishing sign-in…</p>
 return children
}
function LiveGate({children}: {children: ReactNode}) {
 const auth = useAuth(), location = useLocation()
 const online=useOnline()
 const savedOwner=useSyncExternalStore(subscribeDeviceSession,storedOwner)
 const [launchOwner]=useState(()=>location.pathname!=='/sign-in' && !new URLSearchParams(window.location.search).has('code') &&
  !returnHint('lemma:sign-in-return') && !returnHint('lemma:oauth-return') ? savedOwner : null)
 const verified=auth.data?.id ?? null
 const signedOut=authSignedOut() || (!verified && !auth.isPending && !auth.isError)
 // The saved copy is available while the SDK loads or retries the same account.
 const returning=!!launchOwner && launchOwner===savedOwner && !signedOut && (!authOwner() || authOwner()===launchOwner)
 const storageChanged=verified && (savedOwner ? savedOwner!==verified : launchOwner===verified)
 const owner=signedOut || storageChanged ? null : verified ?? (returning ? launchOwner : null)
 if (owner && (!auth.isError || returning)) return <ReadyGate key={owner} owner={owner} returning={returning && owner===launchOwner} confirmed={verified===owner}>{children}</ReadyGate>
 if (auth.isPending && online) return <p role="status" className="p-6 text-ink-2">Checking sign-in…</p>
 if (auth.isError && online) return <section className="p-6 text-ink-2">
  <p role="alert">Couldn't check sign-in.</p>
  <Button className="mt-4" onClick={() => void auth.refetch()}>Try again</Button>
 </section>
 return location.pathname === '/sign-in' ? children :
  <Navigate to="/sign-in" replace state={{from: location.pathname + location.search}} />
}
/** A new sign-in waits for setup. A returning owner can open the local notebook immediately. */
export default function AuthGate({children}: {children: ReactNode}) {
 return getMode() === 'demo' ? children : <LiveGate>{children}</LiveGate>
}
