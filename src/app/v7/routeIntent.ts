import {useQueryClient} from '@tanstack/react-query';
import {getApi} from '../../data';
import {checkpointQuery,projectQuery} from '../../data/hooks';
import {useCalendarIdentity,calendarRangeQuery} from '../../data/study/calendarRange';
import {loadRange} from '../../features/calendar/v7/viewModel';
import {dayKey} from '../../features/calendar/model';
import {ownerZone} from '../../lib/format';
import {authGeneration,authSignedOut} from '../../data/authBoundary';
import {getMode} from '../../data/mode';
import {surfaceBetaEnabled} from '../surfaceBeta';
import {v7ScreenFor} from '../v7Kit';
import {v7Modules} from './routeScreens';

const routes={
 '/':'today','/projects':'paths','/review':'review','/calendar':'calendar','/insights':'progress',
 '/proposals':'inbox','/cards':'cards','/atlas':'atlas','/tasks':'tasks','/practice':'practice','/log':'log','/settings':'settings',
} satisfies Record<string,keyof typeof v7Modules>;
const detailModules={
 path:'path',checkpoint:'checkpoint',tutor:'tutor',card:'card','plan-proposal':'proposal',
} as const;
type DetailScreen=keyof typeof detailModules;
export type IntentPath=keyof typeof routes;
export function routeLink(target:EventTarget|null){
 const link=target instanceof Element?target.closest<HTMLAnchorElement>('a[href^="#/"]'):null;
 return link&&(!link.target||link.target==='_self')?link:null;
}
const reviewFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

export function useRouteIntent(beta:boolean){
 const cache=useQueryClient(),calendarOwner=useCalendarIdentity();
 const warm=(href:string,data=true)=>{
  if(!beta||!surfaceBetaEnabled()||navigator.onLine===false)return;
  const [path,search]=href.split('#',1)[0].split('?',2);
  const screen=v7ScreenFor(path);
  const detail=screen&&Object.hasOwn(detailModules,screen)?screen as DetailScreen:null;
  const chunk=Object.hasOwn(routes,path)?routes[path as IntentPath]:detail?detailModules[detail]:null;
  if(!chunk)return;
  v7Modules[chunk].warm();
  if(detail==='path'&&new URLSearchParams(search).get('tab')==='sources'){
   void v7Modules.path.read().then(module=>{if(surfaceBetaEnabled()&&navigator.onLine!==false)module.warmSources();}).catch(()=>undefined);
  }
  const mode=getMode(),generation=authGeneration();
  if(!data||(mode==='live'&&(authSignedOut()||!cache.getQueryData(['auth']))))return;
  const api=getApi();
  const current=()=>surfaceBetaEnabled()&&navigator.onLine!==false&&getMode()===mode&&authGeneration()===generation;
  const settings=()=>cache.fetchQuery({queryKey:['settings'],queryFn:()=>api.getSettings()});
  const speculative=(read:Promise<unknown>)=>{void read.catch(()=>undefined);};
  switch(path){
   case '/':void cache.prefetchQuery({queryKey:['home'],queryFn:()=>api.getHome()});break;
   case '/projects':
    void cache.prefetchQuery({queryKey:['projects'],queryFn:()=>api.listProjects()});
    void cache.prefetchQuery({queryKey:['decks'],queryFn:()=>api.getDeckTree()});
    break;
   case '/review':
    void cache.prefetchQuery({queryKey:['decks'],queryFn:()=>api.getDeckTree()});
    void cache.prefetchQuery({queryKey:['review-items',reviewFilter],queryFn:()=>api.getReviewItems(reviewFilter)});
    break;
   case '/calendar':
    speculative(settings().then(preferences=>{
     if(!current())return;
     const zone=ownerZone(preferences),date=dayKey(new Date(),zone);
     const view=window.matchMedia?.('(min-width: 1100px)')?.matches?'week':'day';
     return cache.prefetchQuery(calendarRangeQuery(calendarOwner,loadRange(view,date,zone,preferences.weekStart??1)));
    }));
    break;
   case '/settings':speculative(settings());break;
   case '/insights':void cache.prefetchQuery({queryKey:['insights',30],queryFn:()=>api.getInsightData(30)});break;
   case '/cards':speculative(v7Modules.cards.read().then(module=>{if(current())return module.warmCards(cache);}));break;
   case '/practice':speculative(v7Modules.practice.read().then(module=>{if(current())module.warmPractice();}));break;
   case '/tasks':speculative(v7Modules.tasks.read().then(module=>{if(current())module.warmTasks();}));break;
   case '/log':speculative(Promise.all([v7Modules.log.read(),settings()]).then(([module,preferences])=>{
    if(current())module.warmTimeLog(ownerZone(preferences));
   }));break;
   case '/atlas':void cache.prefetchQuery({queryKey:['atlas'],queryFn:()=>api.getAtlas()});break;
   case '/proposals':void cache.prefetchQuery({queryKey:['proposals'],queryFn:()=>api.listProposals()});break;
  }
  if(!detail)return;
  let owner:string,code:string|undefined;
  try{[,owner,,code]=path.slice(1).split('/').map(decodeURIComponent);}catch{return;}
  switch(detail){
   case 'path':void cache.prefetchQuery(projectQuery(owner));break;
   case 'checkpoint':
   case 'tutor':
    if(code)void cache.prefetchQuery(checkpointQuery(owner,code));
    else void cache.prefetchQuery(projectQuery(owner));
    break;
   case 'card':{
    const number=Number(owner);
    if(Number.isSafeInteger(number)&&number>0)void cache.prefetchQuery({queryKey:['card',number],queryFn:()=>api.getCard(number)});
    break;
   }
   case 'plan-proposal':void cache.prefetchQuery({queryKey:['proposal',owner],queryFn:()=>api.getProposal(owner)});break;
  }
 };
 const warmLink=(target:EventTarget|null,data=true)=>{
  const href=routeLink(target)?.hash.slice(1);
  if(href)warm(href,data);
 };
 return {warm,warmLink};
}
