import {createLazyModule,lazyFromModule} from '../lazyModule';

export const v7Modules={
 today:createLazyModule(()=>import('../../features/home/v7/V7Today')),
 paths:createLazyModule(()=>import('../../features/projects/v7/PathsV7')),
 path:createLazyModule(()=>import('../../features/project/v7/V7Path')),
 checkpoint:createLazyModule(()=>import('../../features/checkpoint/v7/CheckpointV7')),
 tutor:createLazyModule(()=>import('../../features/tutor/TutorPage')),
 settings:createLazyModule(()=>import('../../features/settings/v7/SettingsV7')),
 calendar:createLazyModule(()=>import('../../features/calendar/v7/V7CalendarDay')),
 review:createLazyModule(()=>import('../../features/review/v7/ReviewHubV7')),
 reviewRun:createLazyModule(()=>import('../../features/review-run/v7/ReviewRoundV7')),
 reviewDone:createLazyModule(()=>import('../../features/review-done/v7/RoundCompleteV7')),
 progress:createLazyModule(()=>import('../../features/insights/v7/ProgressV7')),
 cards:createLazyModule(()=>import('../../features/cards/v7/CardsV7')),
 card:createLazyModule(()=>import('../../features/card/v7/CardV7')),
 atlas:createLazyModule(()=>import('../../features/atlas/v7/AtlasV7')),
 session:createLazyModule(()=>import('../../features/session/v7/SessionV7')),
 inbox:createLazyModule(()=>import('../../features/proposals/v7/InboxV7')),
 proposal:createLazyModule(()=>import('../../features/plan-proposal/v7/PlanProposalV7')),
 signIn:createLazyModule(()=>import('../../features/sign-in/v7/SignInV7')),
 kit:createLazyModule(()=>import('../../features/kit/V7Page')),
 log:createLazyModule(()=>import('../../features/time-log/v7/TimeLogV7')),
 closeDay:createLazyModule(()=>import('../../features/ritual/v7/CloseDayV7')),
 practice:createLazyModule(()=>import('../../features/practice/v7/PracticeV7')),
 tasks:createLazyModule(()=>import('../../features/tasks/v7/TasksV7')),
};

export const ReviewRoundScreen=lazyFromModule(v7Modules.reviewRun.read);
export const PathScreen=lazyFromModule(v7Modules.path.read);
export const PathsScreen=lazyFromModule(v7Modules.paths.read);
export const CardsScreen=lazyFromModule(v7Modules.cards.read);
export const CardScreen=lazyFromModule(v7Modules.card.read);

/** Warm the exact chunk the route will need when an input signals intent. */
export function warmV7Screen(screen:keyof typeof v7Modules):void{
 v7Modules[screen].warm();
}
