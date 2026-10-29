import { NavLink } from 'react-router'
import { House, Folder, Layers, ChartColumn } from 'lucide-react'
const tabs = [
 { to: '/', label: 'Home', icon: House },
 { to: '/projects', label: 'Projects', icon: Folder },
 { to: '/review', label: 'Review', icon: Layers },
 { to: '/insights', label: 'Insights', icon: ChartColumn },
]
/** UI-1 owns the final tab-bar polish and motion. */
export default function TabBar() {
 return <nav aria-label="Main navigation" className="glass fixed inset-x-4 bottom-[calc(20px+env(safe-area-inset-bottom))] z-20 mx-auto flex h-16 max-w-[480px] items-center justify-around rounded-slab">
  {tabs.map(({to, label, icon: Icon}) => <NavLink key={to} to={to} end className={({isActive}) => `flex min-h-11 min-w-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-amber' : 'text-ink-3'}`}>
   <Icon aria-hidden="true" size={22} strokeWidth={1.75}/><span>{label}</span>
  </NavLink>)}
 </nav>
}
