import {createLazyModule} from './lazyModule';
import {lazyRoute} from './lazyRoute';

// The optional Week page is additive, like Calendar and Tasks.
export const weekRoute=lazyRoute('/week',createLazyModule(()=>import('../features/week/v7/WeekV7')));
