import {useQueryClient} from '@tanstack/react-query';
import {getApi} from '../../data';
import {useCalendarIdentity,calendarRangeQuery} from '../../data/study/calendarRange';
import {loadRange} from '../../features/calendar/v7/viewModel';
import {dayKey} from '../../features/calendar/model';
import type {Settings} from '../../data/types';
import {authSignedOut} from '../../data/authBoundary';
import {getMode} from '../../data/mode';
import {warmV7Screen,v7Modules} from './routeScreens';

const routes={
 '/':'today','/projects':'paths','/review':'review','/calendar':'calendar','/insights':'progress',
 '/proposals':'inbox','/cards':'cards','/atlas':'atlas','/tasks':'tasks','/practice':'practice','/log':'log','/settings':'settings',
} satisfies Record<string,keyof typeof v7Modules>;
export type IntentPath=keyof typeof routes;
const reviewFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

export function useRouteIntent(){
 const cache=useQueryClient(),calendarOwner=useCalendarIdentity();
 const warm=(path:IntentPath)=>{
  if(navigator.onLine===false)return;
  warmV7Screen(routes[path]);
  if(getMode()==='live'&&(authSignedOut()||!cache.getQueryData(['auth'])))return;
  const api=getApi();
  switch(path){
   case '/':void cache.prefetchQuery({queryKey:['home'],queryFn:()=>api.getHome()});break;
   case '/projects':void cache.prefetchQuery({queryKey:['projects'],queryFn:()=>api.listProjects()});break;
   case '/review':
    void cache.prefetchQuery({queryKey:['decks'],queryFn:()=>api.getDeckTree()});
    void cache.prefetchQuery({queryKey:['review-items',reviewFilter],queryFn:()=>api.getReviewItems(reviewFilter)});
    break;
   case '/calendar':{
    const settings=cache.getQueryData<Settings>(['settings']);
    if(!settings?.timeZone){void cache.prefetchQuery({queryKey:['settings'],queryFn:()=>api.getSettings()});break;}
    const date=dayKey(new Date(),settings.timeZone),view=window.matchMedia?.('(min-width: 1100px)')?.matches?'week':'day';
    void cache.prefetchQuery(calendarRangeQuery(calendarOwner,loadRange(view,date,settings.timeZone,settings.weekStart??1)));
    break;
   }
   case '/settings':void cache.prefetchQuery({queryKey:['settings'],queryFn:()=>api.getSettings()});break;
   case '/insights':void cache.prefetchQuery({queryKey:['insights',30],queryFn:()=>api.getInsightData(30)});break;
   case '/cards':
   case '/practice':
   case '/tasks':
   case '/log':void cache.prefetchQuery({queryKey:['home'],queryFn:()=>api.getHome()});break;
   case '/atlas':void cache.prefetchQuery({queryKey:['atlas'],queryFn:()=>api.getAtlas()});break;
   case '/proposals':void cache.prefetchQuery({queryKey:['proposals'],queryFn:()=>api.listProposals()});break;
  }
 };
 return {warm,handlers:(path:IntentPath)=>({
  onMouseEnter:()=>{if(navigator.onLine!==false)warmV7Screen(routes[path]);},
  onPointerDown:()=>warm(path),onFocus:()=>warm(path),
 })};
}
