import {NavLink,useLocation} from 'react-router';
import {House,Folder,Layers,ChartColumn,CalendarDays} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
import {useHome} from '../data/hooks';
import {isFlagOn} from '../flags';
export const legacyTabs=[{to:'/',label:'Today',icon:House},{to:'/projects',label:'Paths',icon:Folder},{to:'/review',label:'Review',icon:Layers},{to:'/insights',label:'Insights',icon:ChartColumn}] as const;
export const v6Tabs=[...legacyTabs.slice(0,3),{to:'/calendar',label:'Calendar',icon:CalendarDays},{to:'/insights',label:'Progress',icon:ChartColumn}];
export function navigationTabs(v6:boolean){return v6?v6Tabs:legacyTabs;}

/** The mockup's five persistently labelled destinations; legacy dock remains flag-off. */
export default function TabBar(){
 const reduce=!!useReducedMotion();
 const v6=isFlagOn('v6Shell');
 const pathname=useLocation().pathname;
 const tabs=navigationTabs(v6);
 const {data}=useHome();
 return <nav aria-label="Main navigation" data-ui={v6?'main-navigation':undefined}
  className={'fixed inset-x-0 bottom-0 z-30 flex h-[calc(var(--tab)+env(safe-area-inset-bottom))] w-full items-center justify-around border-t border-edge-2 bg-[var(--tab-bg)] pb-[env(safe-area-inset-bottom)] '+(v6?'px-1':'px-2')}>
 {tabs.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end aria-label={label}
 className={({isActive})=>{
  const selected=isActive||(v6&&(
   (label==='Paths'&&(pathname.startsWith('/p/')||pathname==='/projects/new'))||
   (label==='Review'&&(pathname.startsWith('/review/')||pathname.startsWith('/cards')))));
  if(v6)return 'relative flex min-h-11 min-w-0 basis-0 flex-1 flex-col items-center justify-center gap-[2px] rounded-ctl '+(selected?'border-t-2 border-current bg-[var(--paper-2)] text-ink':'text-ink-3');
  return 'relative flex min-h-11 min-w-[64px] max-w-[160px] flex-1 flex-col items-center justify-center gap-[2px] rounded-ctl '+(isActive?'text-amber':'text-ink-3');
 }}>
 {({isActive})=><>
 <span className="relative inline-flex items-center gap-1"><Icon aria-hidden="true" size={22} strokeWidth={1.75}/>
 {!v6&&label==='Review'&&!!data?.due&&<span className="absolute -right-5 -top-2 flex min-w-5 max-w-[48px] items-center justify-center rounded-[4px] px-1 text-[12px] font-bold tabular-nums" style={{background:'var(--accent)',color:'var(--on-accent)'}}>{data.due>999?'999+':data.due}</span>}
 </span>
 {v6?<span className="lemma-nav-active-label text-[12px] font-semibold whitespace-nowrap">{label}</span>:
 isActive&&<motion.span initial={reduce?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:reduce?0.15:0.2}} className="text-[12px] font-semibold">{label}</motion.span>}
 </>}
 </NavLink>)}</nav>;
}
