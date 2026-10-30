import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import AuthGate from '../../../src/app/AuthGate'
const state = vi.hoisted(() => ({
 mode: 'live', bootstrap: vi.fn(), refetch: vi.fn(),
 auth: {data: {email: 'owner@example.test'} as {email:string}|null, isPending:false, isError:false},
}))
vi.mock('../../../src/data', () => ({getApi: () => ({bootstrap: state.bootstrap})}))
vi.mock('../../../src/data/hooks', () => ({useAuth: () => ({...state.auth, refetch: state.refetch})}))
vi.mock('../../../src/data/mode', () => ({getMode: () => state.mode}))
vi.mock('../../../src/ui/Button', () => ({Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}/>}))
let root: Root, host: HTMLDivElement, client: QueryClient
function Page() {const location = useLocation(); return <p data-page>{location.pathname + location.search}</p>}
async function render(path = '/') {
 await act(async () => root.render(<StrictMode><QueryClientProvider client={client}>
  <MemoryRouter initialEntries={[path]}><AuthGate><Page/></AuthGate></MemoryRouter>
 </QueryClientProvider></StrictMode>))
}
async function settle(assertion: () => void) {
 await vi.waitFor(async () => {await act(async () => {await new Promise(r => setTimeout(r, 10))}); assertion()})
}
beforeEach(() => {
 Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true})
 sessionStorage.clear(); window.history.replaceState(null, '', '/lemma/?code=example')
 state.mode = 'live'; state.auth = {data:{email:'owner@example.test'},isPending:false,isError:false}
 state.bootstrap.mockReset().mockResolvedValue({}); state.refetch.mockReset()
 client = new QueryClient({defaultOptions:{queries:{retry:false}}})
 host = document.createElement('div');document.body.append(host);root = createRoot(host)
})
afterEach(async () => {await act(async () => root.unmount());client.clear();host.remove()})
test('callback holds protected content until setup succeeds, then restores saved study route', async () => {
 let finish!: (value: object) => void
 state.bootstrap.mockImplementation(() => new Promise(resolve => {finish = resolve}))
 sessionStorage.setItem('lemma:sign-in-return', '/p/analysis?tab=sessions')
 sessionStorage.setItem('lemma:oauth-return', '#/sign-in')
 await render()
 expect(host.textContent).toBe('Finishing sign-in…')
 expect(host.querySelector('[data-page]')).toBeNull()
 expect(sessionStorage.getItem('lemma:sign-in-return')).not.toBeNull()
 await act(async () => finish({}))
 await settle(() => expect(host.textContent).toBe('/p/analysis?tab=sessions'))
 expect(state.bootstrap).toHaveBeenCalledTimes(1)
 expect(sessionStorage.getItem('lemma:sign-in-return')).toBeNull()
 expect(sessionStorage.getItem('lemma:oauth-return')).toBeNull()
 expect(window.location.search).toBe('')
})
test('bootstrap failure retains return target and explicit retry completes sign-in', async () => {
 state.bootstrap.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({})
 sessionStorage.setItem('lemma:sign-in-return','/cards/12')
 await render()
 await settle(() => expect(host.querySelector('[role=alert]')).not.toBeNull())
 expect(host.querySelector('[data-page]')).toBeNull()
 expect(sessionStorage.getItem('lemma:sign-in-return')).toBe('/cards/12')
 await act(async () => host.querySelector('button')!.click())
 await settle(() => expect(host.textContent).toBe('/cards/12'))
 expect(state.bootstrap).toHaveBeenCalledTimes(2)
})
test('already authenticated sign-in page bootstraps and leaves sign-in', async () => {
 await render('/sign-in');await settle(() => expect(host.textContent).toBe('/'))
 expect(state.bootstrap).toHaveBeenCalledTimes(1)
})
test('adapter hash return is supported when no screen-level return exists', async () => {
 sessionStorage.setItem('lemma:oauth-return','#/review?deck=analysis')
 await render();await settle(() => expect(host.textContent).toBe('/review?deck=analysis'))
})
test('external and sign-in loop targets are ignored in favor of the current local route', async () => {
 sessionStorage.setItem('lemma:sign-in-return','//external.test')
 sessionStorage.setItem('lemma:oauth-return','#/sign-in?again=1')
 await render('/settings');await settle(() => expect(host.textContent).toBe('/settings'))
})
test('unauthenticated protected route redirects to sign-in without bootstrap', async () => {
 state.auth.data = null
 await render('/cards');await settle(() => expect(host.textContent).toBe('/sign-in'))
 expect(state.bootstrap).not.toHaveBeenCalled()
})
test('auth errors offer retry without loading protected content or bootstrapping', async () => {
 state.auth.isError = true
 await render('/cards')
 expect(host.querySelector('[role=alert]')?.textContent).toBe("Couldn't check sign-in.")
 await act(async () => host.querySelector('button')!.click())
 expect(state.refetch).toHaveBeenCalledTimes(1);expect(state.bootstrap).not.toHaveBeenCalled()
})
test('demo bypasses auth and setup', async () => {
 state.mode = 'demo';state.auth.isPending = true
 await render('/review');expect(host.textContent).toBe('/review');expect(state.bootstrap).not.toHaveBeenCalled()
})
