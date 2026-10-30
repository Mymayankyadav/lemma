import {NavLink} from 'react-router';
import {House,Folder,Layers,ChartColumn} from 'lucide-react';
import {motion,useReducedMotion} from 'motion/react';
import {useHome} from '../data/hooks';
const tabs=[{to:'/',label:'Today',icon:House},{to:'/projects',label:'Paths',icon:Folder},{to:'/review',label:'Review',icon:Layers},{to:'/insights',label:'Insights',icon:ChartColumn}] as const;
/** A four-action dock: active labels only, large hit regions and a live due badge. */
export default function TabBar(){
 const reduce=!!useReducedMotion();
 const {data}=useHome();
 return <nav aria-label="Main navigation" className="glass fixed inset-x-4 bottom-[calc(20px+env(safe-area-inset-bottom))] z-30 mx-auto flex h-[var(--tab)] max-w-[480px] items-center justify-around rounded-slab px-1">
 {tabs.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end aria-label={label}
 className={({isActive})=>`relative flex min-h-11 min-w-[64px] flex-1 flex-col items-center justify-center gap-[2px] rounded-ctl ${isActive?'text-amber':'text-ink-3'}`}>
 {({isActive})=><>
 <span className="relative"><Icon aria-hidden="true" size={22} strokeWidth={1.75}/>
 {label==='Review'&&!!data?.due&&<span className="absolute -right-4 -top-2 flex min-w-5 items-center justify-center rounded-[4px] px-1 text-[10px] font-bold" style={{background:'var(--accent)',color:'var(--on-accent)'}}>{data.due}</span>}
 </span>{isActive&&<motion.span initial={reduce?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:reduce?0.15:0.2}} className="text-[11px] font-semibold">{label}</motion.span>}
 </>}
 </NavLink>)}</nav>;
}
