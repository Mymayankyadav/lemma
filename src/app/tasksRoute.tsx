import {lazy,Suspense} from 'react';
import RouteError,{RouteFallback} from './RouteError';
const TasksPage=lazy(()=>import('../features/tasks/Page'));
export const tasksRoute={
 path:'/tasks',
 element:<Suspense fallback={<RouteFallback/>}><TasksPage/></Suspense>,
 errorElement:<RouteError/>,
};
