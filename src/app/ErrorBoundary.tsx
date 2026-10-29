import { Component } from 'react'
import type { ReactNode } from 'react'
export default class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
 state = {failed: false}
 static getDerivedStateFromError() { return {failed: true} }
 render() {
  if (this.state.failed) return <main className="relative mx-auto max-w-[528px] p-6">
   <h1 className="text-2xl font-semibold">Couldn't open Lemma</h1>
   <p className="my-4 text-ink-2">Reload to try again.</p>
   <button className="lit px-6" onClick={() => window.location.reload()}>Try again</button>
  </main>
  return this.props.children
 }
}
