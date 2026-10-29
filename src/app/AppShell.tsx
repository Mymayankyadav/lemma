import { Outlet, useLocation } from 'react-router'
import TabBar from './TabBar'
import DemoChip from './DemoChip'
const tabPaths = new Set(['/', '/projects', '/review', '/insights'])
export default function AppShell() {
 const {pathname} = useLocation()
 const showTabs = tabPaths.has(pathname)
 return <>
  <div className="ground" aria-hidden="true" />
  <DemoChip />
  <main id="main-content" className={`relative mx-auto min-h-dvh max-w-[528px] px-6 pt-[calc(max(env(safe-area-inset-top),12px)+16px)] ${showTabs ? 'pb-[calc(108px+env(safe-area-inset-bottom))]' : 'pb-6'}`}>
   <Outlet />
  </main>
  {showTabs && <TabBar />}
 </>
}
