import {lazy} from 'react';

const load = {
 today:()=>import('../../features/home/v7/V7Today'),
 settings:()=>import('../../features/settings/v7/SettingsV7'),
 path:()=>import('../../features/project/v7/V7Path'),
 checkpoint:()=>import('../../features/checkpoint/v7/CheckpointV7'),
 tutor:()=>import('../../features/tutor/TutorPage'),
};

export const TodayScreen=lazy(load.today);
export const SettingsScreen=lazy(load.settings);
export const PathScreen=lazy(load.path);
export const CheckpointScreen=lazy(load.checkpoint);
export const TutorScreen=lazy(load.tutor);

/** Warm the exact chunk the route will need when an input signals intent. */
export function warmV7Screen(screen:keyof typeof load):void{
 void load[screen]().catch(()=>{/* Navigation retains the route error boundary. */});
}
