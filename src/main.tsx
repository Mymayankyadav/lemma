import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/app.css'
// A direct Atlas deep link should begin fetching the same lazy route chunk
// before the providers mount. No Atlas code is evaluated on cold Today/Paths.
// The router still owns errors and route readiness; this only overlaps fetch.
if(window.location.hash.startsWith('#/atlas')){
 void import('./features/atlas/Page').catch(()=>{/* Router renders the route error. */});
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
