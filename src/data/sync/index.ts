import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getMode } from '../mode';
import { OwnerChangePoller, type ChangePage } from './controller';
import { isOwnerQuery } from './keys';

let active: {key: string; client: QueryClient; users: number; poller: OwnerChangePoller} | null = null;
const lastAccount = new WeakMap<QueryClient, string>();

/** Invoked only for an authenticated live owner; no service credentials. */
function subscribe(client: QueryClient, email: string): () => void {
  const key = 'live:' + email.toLowerCase();
  if (active && (active.key !== key || active.client !== client)) {
    active.poller.stop();
    active = null;
  }
  if (lastAccount.has(client) && lastAccount.get(client) !== key) {
    // A signed-in owner must never see a prior account's cached data.
    client.removeQueries({predicate: isOwnerQuery});
  }
  lastAccount.set(client, key);
  if (!active) {
    const poller = new OwnerChangePoller(client, async cursor => {
      const { liveClient } = await import('../live/client');
      const db = liveClient();
      const {data: auth, error: authError} = await db.auth.getUser();
      if (authError || !auth.user || auth.user.email?.toLowerCase() !== email.toLowerCase()) {
        throw new Error('Account changed or signed out');
      }
      const {data, error} = await db.rpc('changes_since', {p_cursor: cursor, p_limit: 100});
      if (error) throw error;
      return data as ChangePage;
    });
    active = {key, client, users: 0, poller};
    void poller.start();
  }
  const subscription = active;
  subscription.users++;
  return () => {
    subscription.users--;
    if (subscription.users <= 0) {
      subscription.poller.stop();
      if (active === subscription) active = null;
    }
  };
}

/** One hook attachment in useAuth, which also handles sign-out/account switch. */
export function useOwnerSync(email: string | null): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!email || getMode() !== 'live') return;
    return subscribe(client, email);
  }, [client, email]);
}
export { OwnerChangePoller } from './controller';
export { RESOURCE_KEYS } from './keys';
