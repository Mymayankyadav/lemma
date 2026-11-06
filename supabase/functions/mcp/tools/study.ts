import type { Context } from '../db.ts';

/** The connector owner is established by the secret-authenticated request, never tool input. */
export type StudyInput = {
  command: {
    operationId: string;
    schemaVersion: 1;
    resource: 'study_entries' | 'study_intervals' | 'calendar_blocks' | 'tasks';
    operation: 'create' | 'update' | 'delete' | 'start' | 'pause' | 'resume' | 'break' | 'save' | 'discard';
    target?: { id: string };
    expectedVersion?: number;
    patch?: Record<string, unknown>;
  };
  client?: 'claude' | 'chatgpt' | 'other';
};

/** Forward the exact v6 command to the security-definer, owner-bound RPC.
 * The receipt (including actionNo / conflict) is not transformed or truncated. */
export async function study(c: Context, input: StudyInput): Promise<unknown> {
  const { data, error } = await c.db.rpc(input.command.resource === 'tasks' ? 'mcp_task_command' : 'mcp_study_command', {
    p_user: c.userId,
    p_source: input.client ?? 'other',
    p: input.command,
  });
  if (error) throw new Error(error.message);
  return data;
}
