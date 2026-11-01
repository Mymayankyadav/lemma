import {lazy,Suspense} from "react";
import RouteError, {RouteFallback} from "./RouteError";
import Page0 from '../features/home/Page'
import Page1 from '../features/projects/Page'
const Page2=lazy(()=>import('../features/new-project/Page'))
const Page3=lazy(()=>import('../features/project/Page'))
const Page4=lazy(()=>import('../features/checkpoint/Page'))
const Page5=lazy(()=>import('../features/session/Page'))
const Page6=lazy(()=>import('../features/proposals/Page'))
const Page7=lazy(()=>import('../features/plan-proposal/Page'))
const Page8=lazy(()=>import('../features/review/Page'))
const Page9=lazy(()=>import('../features/review-run/Page'))
const Page10=lazy(()=>import('../features/review-done/Page'))
const Page11=lazy(()=>import('../features/cards/Page'))
const Page12=lazy(()=>import('../features/card/Page'))
import Page13 from '../features/atlas/Page'
const Page14=lazy(()=>import('../features/insights/Page'))
const Page15=lazy(()=>import('../features/settings/Page'))
const Page16=lazy(()=>import('../features/sign-in/Page'))
const Page17=lazy(()=>import('../features/kit/Page'))
/** The canonical route inventory from design.md §6. */
export const screenRoutes = [
 {path: '/', element: <Suspense fallback={<RouteFallback/>}><Page0 /></Suspense>, errorElement: <RouteError/> },
 {path: '/projects', element: <Suspense fallback={<RouteFallback/>}><Page1 /></Suspense>, errorElement: <RouteError/> },
 {path: '/projects/new', element: <Suspense fallback={<RouteFallback/>}><Page2 /></Suspense>, errorElement: <RouteError/> },
 {path: '/p/:slug', element: <Suspense fallback={<RouteFallback/>}><Page3 /></Suspense>, errorElement: <RouteError/> },
 {path: '/p/:slug/cp/:code', element: <Suspense fallback={<RouteFallback/>}><Page4 /></Suspense>, errorElement: <RouteError/> },
 {path: '/s/:slug/:n', element: <Suspense fallback={<RouteFallback/>}><Page5 /></Suspense>, errorElement: <RouteError/> },
 {path: '/proposals', element: <Suspense fallback={<RouteFallback/>}><Page6 /></Suspense>, errorElement: <RouteError/> },
 {path: '/proposals/:id', element: <Suspense fallback={<RouteFallback/>}><Page7 /></Suspense>, errorElement: <RouteError/> },
 {path: '/review', element: <Suspense fallback={<RouteFallback/>}><Page8 /></Suspense>, errorElement: <RouteError/> },
 {path: '/review/run', element: <Suspense fallback={<RouteFallback/>}><Page9 /></Suspense>, errorElement: <RouteError/> },
 {path: '/review/done', element: <Suspense fallback={<RouteFallback/>}><Page10 /></Suspense>, errorElement: <RouteError/> },
 {path: '/cards', element: <Suspense fallback={<RouteFallback/>}><Page11 /></Suspense>, errorElement: <RouteError/> },
 {path: '/cards/:no', element: <Suspense fallback={<RouteFallback/>}><Page12 /></Suspense>, errorElement: <RouteError/> },
 {path: '/atlas', element: <Suspense fallback={<RouteFallback/>}><Page13 /></Suspense>, errorElement: <RouteError/> },
 {path: '/insights', element: <Suspense fallback={<RouteFallback/>}><Page14 /></Suspense>, errorElement: <RouteError/> },
 {path: '/settings', element: <Suspense fallback={<RouteFallback/>}><Page15 /></Suspense>, errorElement: <RouteError/> },
 {path: '/sign-in', element: <Suspense fallback={<RouteFallback/>}><Page16 /></Suspense>, errorElement: <RouteError/> },
 {path: '/kit', element: <Suspense fallback={<RouteFallback/>}><Page17 /></Suspense>, errorElement: <RouteError/> },
]
