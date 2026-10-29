import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../data/hooks'
import { getMode } from '../data/mode'
function LiveGate({children}: {children: ReactNode}) {
 const auth = useAuth()
 const location = useLocation()
 if (location.pathname === '/sign-in') return children
 if (auth.isPending) return <p role="status" className="p-6 text-ink-2">Checking sign-in…</p>
 if (!auth.data) return <Navigate to="/sign-in" replace state={{from: location.pathname + location.search}} />
 return children
}
/** DATA-1 supplies session reads; demo never waits for an adapter or login. */
export default function AuthGate({children}: {children: ReactNode}) {
 return getMode() === 'demo' ? children : <LiveGate>{children}</LiveGate>
}
