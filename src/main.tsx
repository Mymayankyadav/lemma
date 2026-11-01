import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/app.css'
// A direct cold review-run deep link should start fetching its route module
// while the app shell and providers mount. This does not fetch any user data,
// and other routes keep their lazy loading and cold-entry budgets unchanged.
if(window.location.hash.startsWith('#/review/run')){
 void import('./features/review-run/Page').catch(()=>{/* Router owns the visible error state. */});
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
