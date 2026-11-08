import type { Context } from '../db.ts';

/** The connector owner is established by the secret-authenticated request, never tool input. */
export type StudyInput = {
  command: {
    operationId: string;
    schemaVersion: 1;
    // Existing resources keep their exact legacy bridge; later registered
    // resources use the generic service-role mcp_command dispatcher.
    resource: string;
    /** Includes N52 owner-versioned take_lease, next_phase and exclude_minutes. */
    operation: string;
    target?: { id: string };
    expectedVersion?: number;
    /** N109 links are created on a draft, never by forging owner identity. */
    patch?: Record<string, unknown> & {
      calendar_block_id?: string | null;
      preset_id?: string | null;
      task_id?: string | null;
      energy?: 'low' | 'steady' | 'high' | null;
      device?: string;
      lease_version?: number;
      lease_minutes?: number;
      minutes?: number;
      reason?: string;
    };
  };
  client?: 'claude' | 'chatgpt' | 'other';
};

/** Forward the exact v6 command to the security-definer, owner-bound RPC.
 * The receipt (including actionNo / conflict) is not transformed or truncated. */
export async function study(c: Context, input: StudyInput): Promise<unknown> {
  if(!/^[a-z][a-z0-9_]{0,60}$/.test(input.command.resource)||
     !/^[a-z][a-z0-9_]{0,60}$/.test(input.command.operation))
    throw new Error('Invalid registered resource or operation');
  const legacyStudy=new Set(['study_entries','study_intervals','calendar_blocks']);
  const route=input.command.resource==='tasks'?'mcp_task_command':
    legacyStudy.has(input.command.resource)?'mcp_study_command':'mcp_command';
  const { data, error } = await c.db.rpc(route, {
    p_user: c.userId,
    p_source: input.client ?? 'other',
    p: input.command,
  });
  if (error) throw new Error(error.message);
  return data;
}
