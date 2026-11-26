import {isFlagOn} from '../flags';
import {createLazyModule} from './lazyModule';
import {eagerRoute,lazyRoute} from './lazyRoute';
import {v7Modules} from './v7/routeScreens';
// N150 (bug #1375): keeps an E pressed on the Inbox before its code has loaded.
import '../features/proposals/v7/inboxEarlyKeys';
import HomePage from '../features/home/Page';
import ProjectsPage from '../features/projects/Page';
import AtlasPage from '../features/atlas/Page';

const v7=isFlagOn('v7Shell');
const split=v7&&isFlagOn('v7Room');
const preparePaths=split?v7Modules.paths.read:undefined;
const preparePath=split?v7Modules.path.read:undefined;
const prepareCards=split?v7Modules.cards.read:undefined;
const prepareCard=split?v7Modules.card.read:undefined;

/** The canonical route inventory from design.md §6. */
export const screenRoutes=[
 v7?lazyRoute('/',v7Modules.today):eagerRoute('/',HomePage),
 v7?lazyRoute('/projects',v7Modules.paths,preparePath):eagerRoute('/projects',ProjectsPage),
 lazyRoute('/projects/new',v7?v7Modules.paths:createLazyModule(()=>import('../features/new-project/Page')),preparePath),
 lazyRoute('/p/:slug',v7?v7Modules.path:createLazyModule(()=>import('../features/project/Page')),preparePaths),
 lazyRoute('/p/:slug/cp/:code',v7?v7Modules.checkpoint:createLazyModule(()=>import('../features/checkpoint/Page'))),
 lazyRoute('/s/:slug/:n',v7?v7Modules.session:createLazyModule(()=>import('../features/session/Page'))),
 lazyRoute('/proposals',v7?v7Modules.inbox:createLazyModule(()=>import('../features/proposals/Page'))),
 lazyRoute('/proposals/:id',v7?v7Modules.proposal:createLazyModule(()=>import('../features/plan-proposal/Page'))),
 lazyRoute('/review',v7?v7Modules.review:createLazyModule(()=>import('../features/review/Page'))),
 lazyRoute('/review/run',createLazyModule(()=>import('../features/review-run/Page')),v7?v7Modules.reviewRun.read:undefined),
 lazyRoute('/review/done',v7?v7Modules.reviewDone:createLazyModule(()=>import('../features/review-done/Page'))),
 lazyRoute('/cards',v7?v7Modules.cards:createLazyModule(()=>import('../features/cards/Page')),prepareCard),
 lazyRoute('/cards/:no',v7?v7Modules.card:createLazyModule(()=>import('../features/card/Page')),prepareCards),
 v7?lazyRoute('/atlas',v7Modules.atlas):eagerRoute('/atlas',AtlasPage),
 lazyRoute('/insights',v7?v7Modules.progress:createLazyModule(()=>import('../features/insights/Page'))),
 lazyRoute('/settings',v7?v7Modules.settings:createLazyModule(()=>import('../features/settings/Page'))),
 lazyRoute('/sign-in',v7?v7Modules.signIn:createLazyModule(()=>import('../features/sign-in/Page'))),
 lazyRoute('/kit',v7?v7Modules.kit:createLazyModule(()=>import('../features/kit/Page'))),
];
