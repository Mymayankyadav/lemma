import {Link,NavLink,useLocation} from 'react-router';
import {House,Folder,Layers,ChartColumn,CalendarDays} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
import {useHome} from '../data/hooks';
import {isFlagOn} from '../flags';
export const legacyTabs=[{to:'/',label:'Today',icon:House},{to:'/projects',label:'Paths',icon:Folder},{to:'/review',label:'Review',icon:Layers},{to:'/insights',label:'Insights',icon:ChartColumn}] as const;
export const v6Tabs=[...legacyTabs.slice(0,3),{to:'/calendar',label:'Calendar',icon:CalendarDays},{to:'/insights',label:'Progress',icon:ChartColumn}];
export function navigationTabs(v6:boolean){return v6?v6Tabs:legacyTabs;}
/** N110 (mockup `Main navigation`): detail screens keep their destination highlighted. */
export function v6ActiveTab(to:string,pathname:string){
 if(to===pathname)return true;
 if(to==='/projects')return pathname.startsWith('/p/')||pathname==='/projects/new';
 if(to==='/review')return pathname.startsWith('/cards')||pathname.startsWith('/review/');
 return false;
}
/** v6: the mockup's labelled five-tab bar. */
function V6TabBar(){
 const pathname=useLocation().pathname;
 return <nav aria-label="Main navigation" data-ui="main-navigation"
  className="fixed inset-x-0 bottom-0 z-30 flex w-full items-center justify-around">
  {v6Tabs.map(({to,label,icon:Icon})=>{
   const active=v6ActiveTab(to,pathname);
   return <Link key={to} to={to} aria-label={label} aria-current={active?'page':undefined}
    className={`relative flex min-h-11 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-[2px] rounded-ctl ${active?'text-ink':'text-ink-3'}`}>
    <span className="relative inline-flex items-center gap-1"><Icon aria-hidden="true" size={22} strokeWidth={1.75}/></span>
    <span className="lemma-nav-active-label text-[12px] font-semibold whitespace-nowrap">{label}</span>
   </Link>;})}
 </nav>;
}
/** A four-action dock: active labels only, large hit regions and a live due badge. */
export default function TabBar(){
 return isFlagOn('v6Shell')?<V6TabBar/>:<LegacyTabBar/>;
}
function LegacyTabBar(){
 const reduce=!!useReducedMotion();
 const tabs=legacyTabs;
 const {data}=useHome();
 return <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(var(--tab)+env(safe-area-inset-bottom))] w-full items-center justify-around border-t border-edge-2 bg-[var(--tab-bg)] px-2 pb-[env(safe-area-inset-bottom)]">
 {tabs.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end aria-label={label}
 className={({isActive})=>`relative flex min-h-11 min-w-[64px] max-w-[160px] flex-1 flex-col items-center justify-center gap-[2px] rounded-ctl ${isActive?'text-amber':'text-ink-3'}`}>
 {({isActive})=><>
 <span className="relative"><Icon aria-hidden="true" size={22} strokeWidth={1.75}/>
 {label==='Review'&&!!data?.due&&<span className="absolute -right-5 -top-2 flex min-w-5 max-w-[48px] items-center justify-center rounded-[4px] px-1 text-[12px] font-bold tabular-nums" style={{background:'var(--accent)',color:'var(--on-accent)'}}>{data.due>999?'999+':data.due}</span>}
 </span>{isActive&&<motion.span initial={reduce?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:reduce?0.15:0.2}} className="text-[12px] font-semibold">{label}</motion.span>}
 </>}
 </NavLink>)}</nav>;
}
