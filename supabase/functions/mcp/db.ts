import { createClient } from './deps.ts';
// Dynamic table/projection boundary; tool handlers validate fields and the RPC validates ownership.
export type Db = {from(table:string):any;rpc(fn:string,args?:Record<string,unknown>):PromiseLike<{data:any;error:{message:string}|null}>};
/** Self-test-only IDs are scoped to the current request; never supplied by clients. */
export type Context = { db: Db; userId: string; batch?: any[]; selftestProjectIds?: Set<string> };
export function admin(): Db {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  let key: string | undefined;
  if (raw) {
    try { key = JSON.parse(raw)?.default; } catch { /* use legacy service role */ }
  }
  key ||= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!key || !url) throw new Error('Server database credentials are unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as Db;
}
export function scoped(c: Context, table: string, select = '*') {
  const query = c.db.from(table).select(select).eq('user_id', c.userId);
  return table === 'projects' ? query.neq('status', 'archived') : query;
}
export async function all(c: Context, table: string, select = '*'): Promise<any[]> {
  const {data, error} = await scoped(c, table, select).limit(1000);
  if (error) throw new Error(error.message);
  return data || [];
}
export async function insert(c: Context, table: string, values: Record<string, unknown>): Promise<any> {
  if(c.batch){const row={id:crypto.randomUUID(),...values,user_id:c.userId}; c.batch.push({op:'insert',table,values:row});return row;}
  const {data, error} = await c.db.from(table).insert({...values, user_id: c.userId}).select().single();
  if (error) throw new Error(error.message);
  return data;
}
export async function update(c: Context, table: string, id: string, values: Record<string,unknown>): Promise<any> {
  if(c.batch){c.batch.push({op:'update',table,where:{id},values});return {id,...values};}
  const {data, error} = await c.db.from(table).update(values).eq('user_id', c.userId).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}
export async function rpc(c: Context, fn: string, args: Record<string,unknown>): Promise<any> {
  // The RPC receives an owner-bound UUID, never an unscoped user argument.
  // Verify proposal ownership in the calling tool before each privileged RPC.
  if(c.batch){c.batch.push({op:'rpc',fn,args});return fn==='save_progress'?{step:(args.p_payload as any)?.step,events:(args.p_payload as any)?.events?.length||0}:null;}
  const {data,error}=await c.db.rpc(fn,args);
  if(error) throw new Error(error.message);
  return data;
}
export async function commitBatch(c:Context,tool:string,args:any,summary:string):Promise<any>{
 if(!c.batch?.length)return {action:null};
 const st=await scoped(c,'settings','connector_last_client').single();if(st.error)throw Error(st.error.message);
 const {data,error}=await c.db.rpc('mcp_commit',{p_user:c.userId,p_tool:tool,p_source:args.client||st.data?.connector_last_client||'other',p_summary:summary.slice(0,200),p_commands:c.batch});
 if(error)throw Error(error.message);return data;
}
