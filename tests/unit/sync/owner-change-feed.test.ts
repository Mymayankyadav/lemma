import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { OwnerChangePoller, type ChangePage } from '../../../src/data/sync/controller';

const page = (changes: ChangePage['changes'], nextCursor: number, reset = false): ChangePage =>
  ({changes, nextCursor, reset});
let visibility: 'visible' | 'hidden';
let visibilitySpy: ReturnType<typeof vi.spyOn>;
let client: QueryClient;
beforeEach(() => {
  visibility = 'visible';
  visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  client = new QueryClient({defaultOptions: {queries: {retry: false}}});
});
afterEach(() => {
  visibilitySpy.mockRestore();
  client.clear();
  vi.useRealTimers();
});

describe('N54.1 owner change-feed polling', () => {
  it('invalidates only the mapped resource query keys', async () => {
    client.setQueryData(['tasks'], []);
    client.setQueryData(['home'], {});
    client.setQueryData(['card', 3], {});
    const poller = new OwnerChangePoller(client, async () => page([{resource: 'tasks', cursor: 5}], 5));
    await poller.start();
    expect(client.getQueryState(['tasks'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['home'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['card', 3])?.isInvalidated).toBe(false);
    poller.stop();
  });

  it('falls back to every owner query for an unregistered resource', async () => {
    client.setQueryData(['task'], {});
    client.setQueryData(['card'], {});
    client.setQueryData(['auth'], {email: 'owner@example.com'});
    const poller = new OwnerChangePoller(client, async () => page([{resource: 'brand_new_resource', cursor: 2}], 2));
    await poller.start();
    expect(client.getQueryState(['task'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['card'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['auth'])?.isInvalidated).toBe(false);
    poller.stop();
  });

  it('invalidates all once on reset, then continues at the server cursor', async () => {
    client.setQueryData(['cards'], {});
    const seen: number[] = [];
    const poller = new OwnerChangePoller(client, async cursor => {
      seen.push(cursor);
      return page([], 90, true);
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await poller.start();
    await poller.pollNow();
    expect(seen).toEqual([0, 90]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('drops its cursor on sign-out and starts a new account at zero', async () => {
    const seen: number[] = [];
    const first = new OwnerChangePoller(client, async cursor => {
      seen.push(cursor);
      return page([{resource: 'settings', cursor: 9}], 9);
    });
    await first.start();
    await first.pollNow();
    first.stop();
    const second = new OwnerChangePoller(client, async cursor => {
      seen.push(cursor);
      return page([], cursor);
    });
    await second.start();
    expect(seen).toEqual([0, 9, 0]);
    second.stop();
  });

  it('suspends while hidden and wakes on focus, visible and reconnect', async () => {
    const read = vi.fn(async (cursor: number) => page([], cursor));
    visibility = 'hidden';
    const poller = new OwnerChangePoller(client, read);
    await poller.start();
    expect(read).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('focus'));
    expect(read).not.toHaveBeenCalled();
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    poller.stop();
  });

  it('backs off after RPC failures, and reconnect triggers an immediate retry', async () => {
    vi.useFakeTimers();
    const read = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(page([], 0));
    const poller = new OwnerChangePoller(client, read);
    await poller.start();
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(read).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);
    poller.stop();
  });
});
