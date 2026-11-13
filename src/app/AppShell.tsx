import {lazy,Suspense,useLayoutEffect} from 'react';
import {useOutlet,useLocation,useMatches,useNavigationType} from 'react-router';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import TabBar from './TabBar';
import V6Header from './V6Header';
import FocusAccessorySlot from './FocusAccessorySlot';
import {isFlagOn} from '../flags';
import {setV6Root} from './v6Root';
import {loadShellFonts} from './shellFonts';
import {setShellRoot} from './shellRoot';
import {v7Screen} from './v7Kit';
// Lazy, so flag-off builds never load the v7 shell or its styles on first paint.
const V7Shell=lazy(()=>import('./v7/V7Shell'));
import '../ui/v6/tokens.css';
import '../ui/v6/mockup.css';
import '../ui/v6/mockup-bindings.css';
import DemoChip from './DemoChip';
import {Ground} from '../ui/Ground';
import {GraphSketch} from '../ui/backgrounds/graph/GraphSketch';
import {easeOut} from '../ui/motion';
import './v6-atlas-shell.css';
const tabPaths=new Set(['/','/projects','/review','/insights']);
export default function AppShell(){
 const outlet=useOutlet(),location=useLocation(),navigation=useNavigationType(),reduce=!!useReducedMotion();
 // V32: the catch-all route (an address Lemma does not know) is a v7 page of its own when v7 is on.
 const notFound=useMatches().some(match=>(match.handle as {notFound?:boolean}|undefined)?.notFound===true);
 const screen=notFound&&isFlagOn('v7Shell')?'not-found':v7Screen(location.pathname,location.search),v7=screen!==null,v6=isFlagOn('v6Shell')&&!v7;
 useLayoutEffect(()=>{setShellRoot(v7?'v7':v6?'v6':'legacy');if(!v7)setV6Root(v6);loadShellFonts(v7);return ()=>setShellRoot('legacy');},[v6,v7]);
 const showTabs=v6?location.pathname!=='/sign-in':tabPaths.has(location.pathname),fullBleed=location.pathname==='/atlas'&&(!v6||new URLSearchParams(location.search).get('view')==='map');
 const inboxActions=v6&&location.pathname==='/proposals';
 const tab=showTabs,back=navigation==='POP';
 // The kit, sign-in and first run stand alone: no tab bar or capture.
 if(screen==='kit'||screen==='sign-in'||screen==='welcome')return <>{outlet}</>;
 if(v7)return <Suspense fallback={null}><V7Shell immersive={screen==='focus'||screen==='review-run'||screen==='close-day'} capture={screen!=='atlas'&&screen!=='path'&&screen!=='checkpoint'&&screen!=='session'&&screen!=='card'}>{outlet}</V7Shell></Suspense>;
 return <><Ground lamp={location.pathname==='/atlas'?'none':location.pathname.startsWith('/review')?'tr':'tl'} deep={location.pathname==='/atlas'}/>
 {fullBleed&&!v6&&<DemoChip floating/>}
 <main id="main-content" className={fullBleed?(v6?'v6-atlas-shell relative flex h-dvh w-full flex-col overflow-hidden pb-[calc(var(--tab)+env(safe-area-inset-bottom))] [&>div]:min-h-0 [&>div]:flex-1 [&>div>main]:!h-full':'relative min-h-dvh w-full overflow-hidden'):'relative mx-auto min-h-dvh max-w-[528px] px-6 pt-[calc(max(env(safe-area-inset-top),12px)+16px)] '+(inboxActions?'pb-[calc(var(--tab)+env(safe-area-inset-bottom)+112px)]':showTabs?'pb-[calc(var(--tab)+env(safe-area-inset-bottom)+24px)]':'pb-6')}>
 {!fullBleed&&!v6&&<DemoChip/>}
 {v6&&location.pathname!=='/sign-in'&&<V6Header pathname={location.pathname}/>}
 {!fullBleed&&<GraphSketch path={location.pathname}/>}
 {fullBleed||reduce?<div key={location.pathname}>{outlet}</div>:<AnimatePresence key={fullBleed?'atlas':'standard'} mode="wait" initial={false}>
 <motion.div key={location.pathname} initial={fullBleed?false:reduce?{opacity:0}:tab?{opacity:0,y:8}:{opacity:0,x:back?-30:'24%'}}
 animate={fullBleed?{opacity:1}:{opacity:1,x:0,y:0,scale:1,filter:'brightness(1)'}}
 exit={fullBleed?{opacity:0}:reduce?{opacity:0}:tab?{opacity:0,y:-8}:{opacity:0,x:back?'24%':-14,scale:0.94,filter:'brightness(0.6)'}}
 transition={{duration:reduce?0.15:tab?0.2:0.36,ease:easeOut}}>
 {outlet}
 </motion.div>
 </AnimatePresence>}</main>
 {v6&&showTabs&&<FocusAccessorySlot/>}
 {showTabs&&<TabBar/>}</>;
}
