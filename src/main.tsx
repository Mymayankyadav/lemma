import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'

// A direct Review-run cold entry requests its route module before the App
// dependency graph. Static imports are evaluated before module body code, so
// an eager App import here defeats the conditional HTML preload on 4x CPU.
const hash = window.location.hash.split('?')[0]
if (hash === '#/review/run') {
  // Fetch code only; the Router still owns data loading and visible errors.
  void import('./features/review-run/Page').catch(() => {
    // The normal route import will surface any error to the app.
  })
}

// All routes render the same StrictMode App. Non-review routes do not fetch
// Review-run code; CI's existing Atlas/Today/Cards cold budgets guard the
// small asynchronous App bootstrap against unrelated regressions.
void import('./app/App').then(({default: App}) => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
})
