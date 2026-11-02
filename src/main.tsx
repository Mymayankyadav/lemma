import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'

// A direct Review-run cold entry requests its route module before the App
// dependency graph. Static imports are evaluated before module body code, so
// an eager App import here defeats the conditional HTML preload on 4x CPU.
const hash = window.location.hash.split('?')[0]
if (hash === '#/review/run') {
  // Request the route before warming its adapter; the Router owns visible errors.
  void import('./features/review-run/Page').catch(() => {
    // The normal route import will surface any error to the app.
  })
  void import('./data').then(({getApi}) => {
    try{getApi()}catch{/* Router/query surfaces adapter initialization errors. */}
  }).catch(() => {})
}

// All routes render the same StrictMode App. Non-review routes do not fetch
// Review-run code; CI's existing Atlas/Today/Cards cold budgets guard the
// small asynchronous App bootstrap against unrelated regressions.
void import('./app/App').then(({default: App}) => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
}).catch(() => {
  // The ErrorBoundary lives inside App, so a failed App chunk cannot reach it.
  // Keep recovery dependency-free and mount it only on an actual import error;
  // cold routes still load their original App/Review modules in the same order.
  const host = document.getElementById('root')
  if (!host) return
  const recovery = document.createElement('main')
  recovery.setAttribute('role', 'alert')
  recovery.className = 'flex min-h-dvh flex-col items-center justify-center gap-4 bg-obsidian p-6 text-center text-ink'
  const heading = document.createElement('h1')
  heading.className = 'font-serif text-2xl'
  heading.textContent = 'Could not load Lemma'
  const message = document.createElement('p')
  message.className = 'text-body text-ink-2'
  message.textContent = 'Check your connection and try again.'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'min-h-11 rounded-ctl border border-edge-2 px-4 text-body'
  retry.textContent = 'Try again'
  retry.addEventListener('click', () => window.location.reload())
  recovery.append(heading, message, retry)
  host.replaceChildren(recovery)
})
