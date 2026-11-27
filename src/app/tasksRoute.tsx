import {isFlagOn} from '../flags';
import {createLazyModule} from './lazyModule';
import {lazyRoute} from './lazyRoute';
import {v7Modules} from './v7/routeScreens';

export const tasksRoute=lazyRoute('/tasks',isFlagOn('v7Shell')?v7Modules.tasks:createLazyModule(()=>import('../features/tasks/Page')));
