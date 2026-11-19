import { describe, expect, it, vi } from 'vitest';
import { commitBatch } from '../../../supabase/functions/mcp/db';
import { formatSelftestHttpFailure } from '../../mcp/smoke-diagnostics.mjs';

vi.mock('../../../supabase/functions/mcp/deps.ts', () => ({ createClient: vi.fn() }));

function context(client?: string, lookupError?: string) {
  const single = vi.fn(async () => ({ data: { connector_last_client: client }, error: lookupError ? { message: lookupError } : null }));
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) }));
  const rpc = vi.fn(async () => ({ data: { action: 42 }, error: null }));
  return { db: { from, rpc }, userId: 'fixture-owner', batch: [{ op: 'update' }] };
}

describe('MCP selftest latency and diagnostics', () => {
  it('commits with explicit client without loading owner settings', async () => {
    const c = context('chatgpt');
    await expect(commitBatch(c, 'edit', { client: 'other' }, 'fixture')).resolves.toEqual({ action: 42 });
    expect(c.db.from).not.toHaveBeenCalled();
    expect(c.db.rpc).toHaveBeenCalledWith('mcp_commit', expect.objectContaining({
      p_user: 'fixture-owner', p_source: 'other', p_commands: c.batch,
    }));
  });

  it('loads the fallback only when needed and still stops on lookup errors', async () => {
    for (const [client, expected] of [['chatgpt', 'chatgpt'], [undefined, 'other']] as const) {
      const c = context(client);
      await commitBatch(c, 'edit', {}, 'fixture');
      expect(c.db.from).toHaveBeenCalledOnce();
      expect(c.db.rpc).toHaveBeenCalledWith('mcp_commit', expect.objectContaining({ p_source: expected }));
    }
    const c = context(undefined, 'settings unavailable');
    await expect(commitBatch(c, 'edit', {}, 'fixture')).rejects.toThrow('settings unavailable');
    expect(c.db.rpc).not.toHaveBeenCalled();
  });

  it('does not query settings or write an empty batch', async () => {
    const c = { ...context('chatgpt'), batch: [] };
    await expect(commitBatch(c, 'edit', {}, 'fixture')).resolves.toEqual({ action: null });
    expect(c.db.from).not.toHaveBeenCalled();
    expect(c.db.rpc).not.toHaveBeenCalled();
  });

  it.each([3, 4])('labels the actual partition %d for a worker limit', part => {
    const result = formatSelftestHttpFailure({ part, status: 546, contentType: 'application/json', elapsedMs: 75582 });
    expect(result).toBe('selftest part ' + part + ' HTTP 546 (edge worker resource limit; json response; 75582ms; endpoint redacted)');
  });

  it('does not echo an invalid partition value', () => {
    const result = formatSelftestHttpFailure({ part: 'secret', status: 546, contentType: 'text/plain', elapsedMs: 1 });
    expect(result).toContain('part unknown HTTP 546');
    expect(result).not.toContain('secret');
  });
});
