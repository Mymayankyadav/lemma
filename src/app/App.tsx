import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {lazy,Suspense} from 'react'
import { createHashRouter, RouterProvider, Navigate } from 'react-router'
import { LemmaError } from '../data/api'
import AppShell from './AppShell'
import AuthGate from './AuthGate'
import ErrorBoundary from './ErrorBoundary'
import RouteError,{RouteFallback} from './RouteError'
import ToastHost from './ToastHost'
import OfflineBanner from './OfflineBanner'
import PwaStatus from './PwaStatus'
import { screenRoutes } from './routes'
import { calendarRoute } from './calendarRoute'
import { tasksRoute } from './tasksRoute'
import { weekRoute } from './weekRoute'
import {isFlagOn} from '../flags'
const PracticePage=lazy(()=>import('../features/practice/Page'))
const DayRitual=lazy(()=>import('../features/ritual/Page'))
const TimeLog=lazy(()=>import('../features/time-log/Page'))
const FocusV7=lazy(()=>import('../features/focus/v7/FocusV7'))
const WelcomeV7=lazy(()=>import('../features/sign-in/v7/WelcomeV7'))
const NotFoundV7=lazy(()=>import('./v7/NotFoundV7'))
const queryClient = new QueryClient({defaultOptions: {queries: {
 staleTime: 30_000, refetchOnWindowFocus: true,
 retry: (count, error) => !(error instanceof LemmaError && ['auth', 'not_found', 'invalid', 'not_implemented'].includes(error.code)) && count < 2,
 retryDelay: attempt=>Math.min(2_000,250*2**attempt),
}, mutations: {retry: false}}})
const allowKit=import.meta.env.DEV||import.meta.env.MODE==='test'||import.meta.env.VITE_ALLOW_FLAG_OVERRIDES==='1';
const router = createHashRouter([{element: <AuthGate><AppShell /></AuthGate>, errorElement: <RouteError />, children: [
 ...screenRoutes.filter(route=>route.path!=='/kit'||allowKit),
 calendarRoute,
 tasksRoute,
 weekRoute,
 ...(isFlagOn('v6Shell')||isFlagOn('v7Shell')?[{path:'/today/close',
  element:<Suspense fallback={<RouteFallback/>}><DayRitual/></Suspense>,
  errorElement:<RouteError/>}, {path:'/log',
  element:<Suspense fallback={<RouteFallback/>}><TimeLog/></Suspense>,
  errorElement:<RouteError/>}, {path:'/practice',
  element:<Suspense fallback={<RouteFallback/>}><PracticePage/></Suspense>,
  errorElement:<RouteError/>}]:[]),
 // v7 Focus is a full screen of its own (PLAN §6.3); without v7 it stays the Today dialog.
 ...(isFlagOn('v7Shell')?[{path:'/focus',element:<Suspense fallback={<RouteFallback/>}><FocusV7/></Suspense>,errorElement:<RouteError/>},
  // PLAN §6.15 first run: three skippable steps after the first sign-in.
  {path:'/welcome',element:<Suspense fallback={<RouteFallback/>}><WelcomeV7/></Suspense>,errorElement:<RouteError/>}]:[]),
 // V32 (v7 UX audit r3): with v7 an unknown address says so (NotFoundV7); without it, it still goes to Today.
 {path: '*', handle: {notFound: true}, element: isFlagOn('v7Shell')?<Suspense fallback={<RouteFallback/>}><NotFoundV7/></Suspense>:<Navigate to="/" replace />},
]}])
export default function App() {
 return <ErrorBoundary><QueryClientProvider client={queryClient}>
  <RouterProvider router={router} /><ToastHost /><OfflineBanner /><PwaStatus />
 </QueryClientProvider></ErrorBoundary>
}
