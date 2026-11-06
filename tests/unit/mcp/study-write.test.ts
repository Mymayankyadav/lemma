import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { study, type StudyInput } from '../../../supabase/functions/mcp/tools/study';
import type { Context } from '../../../supabase/functions/mcp/db';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '99999999-9999-4999-8999-999999999999';
const envelope: StudyInput['command'] = {
  operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  schemaVersion: 1,
  resource: 'study_entries',
  operation: 'create',
  patch: { source: 'manual', intent: 'Prove the lemma' },
};
function fixture(data: unknown = { status: 'ok', actionNo: 42, changed: [{ version: 1 }] }, error: { message: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { context: { userId: owner, db: { rpc } } as unknown as Context, rpc };
}
describe('N12 owner-bound study write tool', () => {
  it('uses verified Context.userId rather than a requested owner, and passes the exact command', async () => {
    const { context, rpc } = fixture();
    const command = { ...envelope, patch: { ...envelope.patch, user_id: other } };
    const input = { command, client: 'chatgpt', userId: other } as StudyInput;
    await study(context, input);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mcp_study_command', {
      p_user: owner, p_source: 'chatgpt', p: command,
    });
    expect(rpc.mock.calls[0][1].p).not.toHaveProperty('userId');
    // The database rejects forged owner fields inside the envelope. This tool
    // never rewrites them or silently substitutes them.
  });
  it('returns the receipt unchanged, including real actionNo and conflicts', async () => {
    const receipt = { status: 'conflict', operationId: envelope.operationId,
      conflict: { currentVersion: 9 }, actionNo: null };
    const { context } = fixture(receipt);
    expect(await study(context, { command: envelope })).toBe(receipt);
  });
  it('uses other for an unspecified client, not an untrusted owner or hard-coded key', async () => {
    const { context, rpc } = fixture();
    await study(context, { command: envelope });
    expect(rpc.mock.calls[0][1]).toEqual({
      p_user: owner, p_source: 'other', p: envelope,
    });
  });
  it('propagates the database error and does not pretend a write succeeded', async () => {
    const { context } = fixture(null, { message: 'Authentication required' });
    await expect(study(context, { command: envelope })).rejects.toThrow('Authentication required');
  });
  it('registers exactly one new study tool with a strict envelope and no legacy truncation', () => {
    const server = readFileSync('supabase/functions/mcp/server.ts', 'utf8');
    expect(server.match(/registerTool\('study'/g)).toHaveLength(1);
    expect(server).toMatch(/const studyEnvelope=z\.object\(\{/);
    expect(server).toMatch(/command:studyEnvelope/);
    expect(server).toContain('inputSchema:lean(z.object({');
    expect(server).toContain('text:JSON.stringify(receipt)');
    expect(server).not.toMatch(/register\('study'/);
  });
});
