import {useQueryClient} from '@tanstack/react-query';
import {authSignedOut} from '../../data/authBoundary';
import {checkpointQuery,projectQuery} from '../../data/hooks';
import {getMode} from '../../data/mode';
import {warmV7Screen} from './routeScreens';

/** Begin the read on press or focus so it can run while the destination renders. */
export function useReadingIntent(){
 const cache=useQueryClient();
 return (slug:string,code?:string,screen:'path'|'checkpoint'|'tutor'=code?'checkpoint':'path')=>{
  const warm=()=>{if(navigator.onLine!==false)warmV7Screen(screen);};
  const read=()=>{
   if(navigator.onLine===false)return;
   warm();
   if(getMode()==='live'&&(authSignedOut()||!cache.getQueryData(['auth'])))return;
   if(code)void cache.prefetchQuery(checkpointQuery(slug,code));
   else void cache.prefetchQuery(projectQuery(slug));
  };
  return {onMouseEnter:warm,onPointerDown:read,onFocus:read};
 };
}
