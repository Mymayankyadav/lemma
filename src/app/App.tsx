import {StudyUiRelease} from '../data/StudyUiRelease';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createHashRouter, RouterProvider,Navigate,Outlet } from 'react-router'
import { LemmaError } from '../data/api'
import { getMode } from '../data/mode'
import AppShell from './AppShell'
import AuthGate from './AuthGate'
import ErrorBoundary from './ErrorBoundary'
import RouteError from './RouteError'
import ToastHost from './ToastHost'
import PwaStatus from './PwaStatus'
import { screenRoutes } from './routes'
import { calendarRoute } from './calendarRoute'
import { tasksRoute } from './tasksRoute'
import { weekRoute } from './weekRoute'
import {isFlagOn} from '../flags'
import {v7Modules} from './v7/routeScreens'
import {createLazyModule} from './lazyModule'
import {lazyRoute} from './lazyRoute'
import {V7MotionConfig} from '../ui/v7/MotionConfig'
import BootReady from './BootReady'
import {trackPendingInbox} from '../features/proposals/v7/inboxEarlyKeys'
const OfflinePadPage=createLazyModule(()=>import('../features/pad/OfflinePadPage'))
const PracticePage=createLazyModule(()=>import('../features/practice/Page'))
const DayRitual=createLazyModule(()=>import('../features/ritual/Page'))
const TimeLog=createLazyModule(()=>import('../features/time-log/Page'))
const FocusV7=createLazyModule(()=>import('../features/focus/v7/FocusV7'))
const WelcomeV7=createLazyModule(()=>import('../features/sign-in/v7/WelcomeV7'))
const NotFoundV7=createLazyModule(()=>import('./v7/NotFoundV7'))
// TanStack's online listener can miss the event that preceded a cold offline launch.
onlineManager.setOnline(navigator.onLine!==false)
const networkMode=getMode()==='demo'?'always':'online'
const queryClient = new QueryClient({defaultOptions: {queries: {
 networkMode, staleTime: 30_000, refetchOnWindowFocus: true,
 retry: (count, error) => !(error instanceof LemmaError && ['auth', 'not_found', 'invalid', 'not_implemented'].includes(error.code)) && count < 2,
 retryDelay: attempt=>Math.min(2_000,250*2**attempt),
}, mutations: {networkMode, retry: false}}})
const allowKit=import.meta.env.DEV||import.meta.env.MODE==='test'||import.meta.env.VITE_ALLOW_FLAG_OVERRIDES==='1';
const v7=isFlagOn('v7Shell');
const router = createHashRouter([{element: <AuthGate><StudyUiRelease><AppShell /></StudyUiRelease></AuthGate>, errorElement: <RouteError />, HydrateFallback:()=>null,children: [
 ...screenRoutes.filter(route=>route.path!=='/kit'||allowKit),
 calendarRoute,
 tasksRoute,
 weekRoute,
 ...(isFlagOn('v6Shell')||v7?[
  lazyRoute('/today/close',v7?v7Modules.closeDay:DayRitual),
  lazyRoute('/log',v7?v7Modules.log:TimeLog),
  lazyRoute('/practice',v7?v7Modules.practice:PracticePage),
 ]:[]),
 ...(v7?[
  ...['/p/:slug/tutor','/p/:slug/cp/:code/tutor'].map(path=>lazyRoute(path,v7Modules.tutor)),
  lazyRoute('/focus',FocusV7),
  lazyRoute('/welcome',WelcomeV7),
 ]:[]),
 // V32: v7 explains unknown addresses; legacy goes to Today.
 v7?{...lazyRoute('*',NotFoundV7),handle:{notFound:true}}:{path:'*',element:<Navigate to="/" replace/>},
]}, ...(v7&&isFlagOn('padLocal')?[{
 element:<><BootReady/><Outlet/></>,HydrateFallback:()=>null,
 children:[lazyRoute('/pad/:checkpointId?',OfflinePadPage)],
}]:[])])
router.subscribe(({navigation,location})=>trackPendingInbox(navigation.location?.pathname,location.pathname));
export default function App(){
 return <ErrorBoundary><QueryClientProvider client={queryClient}><V7MotionConfig>
  <RouterProvider router={router}/><ToastHost/><PwaStatus/>
 </V7MotionConfig></QueryClientProvider></ErrorBoundary>
}
