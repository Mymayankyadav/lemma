import {lazy,Suspense} from 'react';
import RouteError, {RouteFallback} from './RouteError';

// Keep the existing canonical route inventory stable; Calendar is an additive v6 destination.
const CalendarPage=lazy(()=>import('../features/calendar/Page'));
export const calendarRoute={
 path: '/calendar',
 element: <Suspense fallback={<RouteFallback/>}><CalendarPage /></Suspense>,
 errorElement: <RouteError/>,
};
