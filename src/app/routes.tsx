import {lazy,Suspense} from "react";
import RouteError, {RouteFallback} from "./RouteError";
import Page0 from '../features/home/Page'
import Page1 from '../features/projects/Page'
import Page2 from '../features/new-project/Page'
import Page3 from '../features/project/Page'
import Page4 from '../features/checkpoint/Page'
import Page5 from '../features/session/Page'
import Page6 from '../features/proposals/Page'
import Page7 from '../features/plan-proposal/Page'
import Page8 from '../features/review/Page'
import Page9 from '../features/review-run/Page'
import Page10 from '../features/review-done/Page'
import Page11 from '../features/cards/Page'
import Page12 from '../features/card/Page'
import Page14 from '../features/insights/Page'
import Page15 from '../features/settings/Page'
import Page16 from '../features/sign-in/Page'
import Page17 from '../features/kit/Page'

// Atlas is not needed for the cold Today entry; Paths warms it on demo visits.
const Page13=lazy(()=>import('../features/atlas/Page'))
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
