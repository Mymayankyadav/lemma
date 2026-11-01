import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import {warmReviewRun,defaultReviewRunFilter} from './features/review-run/preload'
import './styles/app.css'
// A direct cold review-run deep link should start fetching its route module
// while the app shell and providers mount. This does not fetch any user data,
// and other routes keep their lazy loading and cold-entry budgets unchanged.
if(window.location.hash.startsWith('#/review/run')){
 // Start the route chunk fetch without synchronously building the stress
 // fixture before first paint. The speculative demo read below creates the
 // adapter after the first frame; live and filtered routes use normal hooks.
 void import('./features/review-run/Page').catch(()=>{/* Router owns the visible error state. */});
 const profile=new URLSearchParams(window.location.search).get('demo');
 if((profile==='stress'||profile==='extreme')&&window.location.hash==='#/review/run'){
  // Wait until after the first shell frame, then overlap the bounded demo
  // card read with route-chunk loading. The normal QueryClient owns the result.
  requestAnimationFrame(()=>setTimeout(()=>warmReviewRun(defaultReviewRunFilter),0));
 }
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
