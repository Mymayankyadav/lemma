import {act, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {createMemoryRouter, Outlet, RouterProvider} from 'react-router';
import {expect, it, vi} from 'vitest';
import {retryLazy, retryNamed} from '../../../src/app/lazyModule';
import RouteError from '../../../src/app/RouteError';

it.each(['Retry', 'Back to Today'])('%s recovers a rejected lazy shell in the same router', async action => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  vi.useFakeTimers();
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let available = false;
  const Layout = () => <Outlet/>;
  const load = vi.fn(async () => {
    if (!available) throw new Error('Shell unavailable');
    return {default: Layout, NamedLayout: Layout};
  });
  const Shell = action === 'Retry' ? retryNamed(load, mod => mod.NamedLayout) : retryLazy(load);
  const entry = {pathname: '/detail', search: '?tab=recent', hash: '#result', state: {from: 'review'}};
  const router = createMemoryRouter([{
    element: <Suspense fallback={<p>Loading shell</p>}><Shell/></Suspense>,
    errorElement: <RouteError/>,
    children: [{path: '/', element: <h1>Today</h1>}, {path: '/detail', element: <h1>Detail</h1>}],
  }], {initialEntries: [entry]});
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  try {
    await act(async () => root.render(<RouterProvider router={router}/>));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(load).toHaveBeenCalledTimes(3);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t open this screen');

    available = true;
    const recovery = host.querySelector<HTMLElement>(action === 'Retry' ? 'button' : 'a')!;
    expect(recovery.textContent).toBe(action);
    await act(async () => recovery.click());
    expect(load).toHaveBeenCalledTimes(4);
    expect(host.querySelector('h1')?.textContent).toBe(action === 'Retry' ? 'Detail' : 'Today');
    if (action === 'Retry') expect(router.state.location).toMatchObject(entry);
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    host.remove();
    errors.mockRestore();
    vi.useRealTimers();
  }
});
