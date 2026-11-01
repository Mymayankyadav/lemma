import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import {getApi} from './data'
import {warmReviewRun,defaultReviewRunFilter} from './features/review-run/preload'
import './styles/app.css'
// A direct cold review-run deep link should start fetching its route module
// while the app shell and providers mount. This does not fetch any user data,
// and other routes keep their lazy loading and cold-entry budgets unchanged.
if(window.location.hash.startsWith('#/review/run')){
 // Begin the route chunk request first, then create the local adapter while
 // it downloads. The normal hook still owns all user-data queries and errors.
 // This conditional path does not affect cold Today, Paths or Atlas entry.
 void import('./features/review-run/Page').catch(()=>{/* Router owns the visible error state. */});
 try{getApi()}catch{/* Router/query surfaces any adapter initialization error. */}
 const profile=new URLSearchParams(window.location.search).get('demo');
 if((profile==='stress'||profile==='extreme')&&window.location.hash==='#/review/run'){
  // Yield the first shell frame, then overlap the bounded demo card read
  // with route-chunk loading. The normal QueryClient owns the result.
  requestAnimationFrame(()=>warmReviewRun(defaultReviewRunFilter));
 }
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
