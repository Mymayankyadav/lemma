import { createClient } from './deps.ts';
export type Db = ReturnType<typeof createClient>;
export type Context = { db: Db; userId: string };
export function admin(): Db {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  let key: string | undefined;
  if (raw) {
    try { key = JSON.parse(raw)?.default; } catch { /* use legacy service role */ }
  }
  key ||= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!key || !url) throw new Error('Server database credentials are unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function scoped(c: Context, table: string, select = '*') {
  return c.db.from(table).select(select).eq('user_id', c.userId);
}
export async function all(c: Context, table: string, select = '*'): Promise<any[]> {
  const {data, error} = await scoped(c, table, select).limit(1000);
  if (error) throw new Error(error.message);
  return data || [];
}
export async function insert(c: Context, table: string, values: Record<string, unknown>): Promise<any> {
  const {data, error} = await c.db.from(table).insert({...values, user_id: c.userId}).select().single();
  if (error) throw new Error(error.message);
  return data;
}
export async function update(c: Context, table: string, id: string, values: Record<string,unknown>): Promise<any> {
  const {data, error} = await c.db.from(table).update(values).eq('user_id', c.userId).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}
export async function rpc(c: Context, fn: string, args: Record<string,unknown>): Promise<any> {
  // The RPC receives an owner-bound UUID, never an unscoped user argument.
  // Verify proposal ownership in the calling tool before each privileged RPC.
  const {data,error}=await c.db.rpc(fn,args);
  if(error) throw new Error(error.message);
  return data;
}