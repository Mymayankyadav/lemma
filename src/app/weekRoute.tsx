import {lazy,Suspense} from 'react';
import RouteError,{RouteFallback} from './RouteError';

// The optional week page is additive, like Calendar and Tasks; keep the canonical inventory stable.
const WeekPage=lazy(()=>import('../features/week/v7/WeekV7'));
export const weekRoute={path: '/week', element: <Suspense fallback={<RouteFallback/>}><WeekPage/></Suspense>, errorElement: <RouteError/>};
