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
import {isFlagOn} from '../flags'
const PracticePage=lazy(()=>import('../features/practice/Page'))
const queryClient = new QueryClient({defaultOptions: {queries: {
 staleTime: 30_000, refetchOnWindowFocus: true,
 retry: (count, error) => !(error instanceof LemmaError && ['auth', 'not_found', 'invalid', 'not_implemented'].includes(error.code)) && count < 2,
 retryDelay: attempt=>Math.min(2_000,250*2**attempt),
}, mutations: {retry: false}}})
const router = createHashRouter([{element: <AuthGate><AppShell /></AuthGate>, errorElement: <RouteError />, children: [
 ...screenRoutes,
 calendarRoute,
 tasksRoute,
 ...(isFlagOn('v6Shell')?[{path:'/practice',
  element:<Suspense fallback={<RouteFallback/>}><PracticePage/></Suspense>,
  errorElement:<RouteError/>}]:[]),
 {path: '*', element: <Navigate to="/" replace />},
]}])
export default function App() {
 return <ErrorBoundary><QueryClientProvider client={queryClient}>
  <RouterProvider router={router} /><ToastHost /><OfflineBanner /><PwaStatus />
 </QueryClientProvider></ErrorBoundary>
}
