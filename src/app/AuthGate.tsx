import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getApi } from '../data'
import { LemmaError } from '../data/api'
import { useAuth } from '../data/hooks'
import { getMode } from '../data/mode'
import { Button } from '../ui/Button'

/** Accept only local hash-router destinations; never return to the sign-in loop. */
function destination(value: string | null | undefined): string | null {
 if (!value) return null
 const path = value.replace(/^#/, '')
 return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') &&
  path.split(/[?#]/)[0] !== '/sign-in' ? path : null
}
function ReadyGate({children, email}: {children: ReactNode; email: string}) {
 const location = useLocation(), navigate = useNavigate(), queryClient = useQueryClient()
 const [target] = useState(() =>
  destination(sessionStorage.getItem('lemma:sign-in-return')) ??
  destination(sessionStorage.getItem('lemma:oauth-return')) ??
  destination((location.state as {from?: string} | null)?.from) ??
  destination(location.pathname + location.search) ?? '/')
 const [restored, setRestored] = useState(false)
 // Bootstrap is idempotent. Share a single request across StrictMode remounts and
 // route changes, and clear this cache with the existing sign-out client.clear().
 const setup = useQuery({queryKey: ['bootstrap', email], queryFn: () => getApi().bootstrap(),
  staleTime: Infinity, retry: false, refetchOnWindowFocus: false})
 useEffect(() => {
  if (!setup.isSuccess || restored) return
  // Bootstrap already returns Settings; seed the normal query before Home mounts.
  // This prevents a redundant fourth REST request on a cold Today open.
  queryClient.setQueryData(['settings'], setup.data)
  sessionStorage.removeItem('lemma:sign-in-return')
  sessionStorage.removeItem('lemma:oauth-return')
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  void navigate(target, {replace: true})
  setRestored(true)
 }, [setup.isSuccess, setup.data, restored, navigate, target, queryClient])
 if (setup.isError) return <section className="p-6 text-ink-2">
  <p role="alert">Couldn't finish sign-in. Your study data hasn't loaded.</p>
  <Button className="mt-4" onClick={() => void setup.refetch()}>Try again</Button>
 </section>
 if (!setup.isSuccess || !restored) return <p role="status" className="p-6 text-ink-2">Finishing sign-in…</p>
 return children
}
function LiveGate({children}: {children: ReactNode}) {
 const auth = useAuth(), location = useLocation()
 const [offlineSession,setOfflineSession]=useState(false)
 const authNetworkFailure=auth.isError&&auth.error instanceof LemmaError&&auth.error.code==='offline'
 useEffect(()=>{
  // A DNS/server outage may leave navigator.onLine true. A cached local
  // session may still read its own snapshot, never mutate or bypass a 401.
  if(navigator.onLine&&!authNetworkFailure)return
  let alive=true,unsubscribe:(()=>void)|null=null
  // Supabase is a large dependency: load it only for a real offline or
  // network-failure session check, never in the demo/Today startup bundle.
  void import('../data/live/client').then(async({liveClient})=>{
   if(!alive)return
   const client=liveClient()
   const subscription=client.auth.onAuthStateChange((_event,session)=>{
    if(alive)setOfflineSession(!!session?.user?.id)
   }).data.subscription
   unsubscribe=()=>subscription.unsubscribe()
   const {data}=await client.auth.getSession()
   if(alive)setOfflineSession(!!data.session?.user.id)
  }).catch(()=>{})
  return()=>{alive=false;unsubscribe?.()}
 },[authNetworkFailure])
 // A previously authenticated owner may read only their local snapshot during
 // a real offline state or a confirmed network failure, never an auth failure.
 if (offlineSession && (!navigator.onLine || authNetworkFailure)) return children
 if (auth.isPending) return <p role="status" className="p-6 text-ink-2">Checking sign-in…</p>
 if (auth.isError) return <section className="p-6 text-ink-2">
  <p role="alert">Couldn't check sign-in.</p>
  <Button className="mt-4" onClick={() => void auth.refetch()}>Try again</Button>
 </section>
 if (!auth.data) return location.pathname === '/sign-in' ? children :
  <Navigate to="/sign-in" replace state={{from: location.pathname + location.search}} />
 return <ReadyGate key={auth.data.email} email={auth.data.email}>{children}</ReadyGate>
}
/** Demo never waits for an adapter or login. Live routes wait for owner setup. */
export default function AuthGate({children}: {children: ReactNode}) {
 return getMode() === 'demo' ? children : <LiveGate>{children}</LiveGate>
}
