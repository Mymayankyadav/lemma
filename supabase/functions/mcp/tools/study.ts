import type { Context } from '../db.ts';
import {validateConversion} from '../../_shared/adaptive/convert.ts';

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
  if((input.command.resource==='proposal_drafts'&&input.command.patch?.kind==='plan_conversion')||input.command.resource==='plan_conversions'){
    const cmd=input.command,patch=cmd.patch??{};
    if(cmd.operation==='create'){
      const {loadRows}=await import('../adaptive.ts');
      const rows=await loadRows(c),project=rows.projects.find(p=>p.id===patch.project_id||p.slug===patch.project);
      if(!project)throw Error('Conversion requires an owner project');
      const errors=validateConversion({project,checkpoints:rows.checkpoints.filter(cp=>cp.project_id===project.id),concepts:rows.concepts.filter(k=>k.subject_id===project.subject_id),cards:(rows.notes??[]).filter(n=>n.project_id===project.id).map(n=>({...n,reps:(rows.cards??[]).filter(c=>c.note_id===n.id).reduce((a,c)=>a+c.reps,0)}))},patch.conversion??patch.payload);
      if(errors.length)throw Error('Conversion validation: '+errors.join('; '));
      input={...input,command:{...cmd,resource:'plan_conversions',patch:{project_id:project.id,conversion:patch.conversion??patch.payload}}};
    }
  }
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
