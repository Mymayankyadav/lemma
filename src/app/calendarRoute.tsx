import {isFlagOn} from '../flags';
import {createLazyModule} from './lazyModule';
import {lazyRoute} from './lazyRoute';
import {v7Modules} from './v7/routeScreens';

// Keep the canonical inventory stable; Calendar is additive.
export const calendarRoute=lazyRoute('/calendar',isFlagOn('v7Shell')?v7Modules.calendar:createLazyModule(()=>import('../features/calendar/Page')));
