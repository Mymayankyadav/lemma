import {useOutlet,useLocation,useNavigationType} from 'react-router';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import TabBar from './TabBar';
import DemoChip from './DemoChip';
import {Ground} from '../ui/Ground';
import {GraphSketch} from '../ui/backgrounds/graph/GraphSketch';
import {easeOut} from '../ui/motion';
const tabPaths=new Set(['/','/projects','/review','/insights']);
export default function AppShell(){
 const outlet=useOutlet(),location=useLocation(),navigation=useNavigationType(),reduce=!!useReducedMotion();
 const showTabs=tabPaths.has(location.pathname),fullBleed=location.pathname==='/atlas';
 const tab=showTabs,back=navigation==='POP';
 return <><Ground lamp={location.pathname==='/atlas'?'none':location.pathname.startsWith('/review')?'tr':'tl'} deep={location.pathname==='/atlas'}/>
 {fullBleed&&<DemoChip floating/>}
 <main id="main-content" className={fullBleed?'relative min-h-dvh w-full overflow-hidden':'relative mx-auto min-h-dvh max-w-[528px] px-6 pt-[calc(max(env(safe-area-inset-top),12px)+16px)] '+(showTabs?'pb-[calc(var(--tab)+env(safe-area-inset-bottom)+24px)]':'pb-6')}>
 {!fullBleed&&<DemoChip/>}
 <GraphSketch path={location.pathname}/>
 {fullBleed||reduce?<div key={location.pathname}>{outlet}</div>:<AnimatePresence key={fullBleed?'atlas':'standard'} mode="wait" initial={false}>
 <motion.div key={location.pathname} initial={fullBleed?false:reduce?{opacity:0}:tab?{opacity:0,y:8}:{opacity:0,x:back?-30:'24%'}}
 animate={fullBleed?{opacity:1}:{opacity:1,x:0,y:0,scale:1,filter:'brightness(1)'}}
 exit={fullBleed?{opacity:0}:reduce?{opacity:0}:tab?{opacity:0,y:-8}:{opacity:0,x:back?'24%':-14,scale:0.94,filter:'brightness(0.6)'}}
 transition={{duration:reduce?0.15:tab?0.2:0.36,ease:easeOut}}>
 {outlet}
 </motion.div>
 </AnimatePresence>}</main>
 {showTabs&&<TabBar/>}</>;
}
