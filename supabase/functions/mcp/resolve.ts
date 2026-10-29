import { Context, scoped } from './db.ts';
export async function project(c: Context, name?: string): Promise<any> {
  const {data,error}=await scoped(c,'projects').order('last_activity_at',{ascending:false,nullsFirst:false}).limit(100);
  if(error) throw new Error(error.message);
  const items=data||[];
  if (!name) {
    if (items.length===1) return items[0];
    throw new Error('Specify project. Projects: '+items.map((p:any)=>p.slug).join(', '));
  }
  const n=name.toLowerCase().trim();
  const matches=items.filter((p:any)=>p.slug===n || p.title.toLowerCase()===n);
  if (matches.length===1) return matches[0];
  const prefixes=items.filter((p:any)=>p.slug.startsWith(n)||p.title.toLowerCase().startsWith(n));
  if(prefixes.length===1) return prefixes[0];
  throw new Error('No unique project "'+name+'". Projects: '+items.map((p:any)=>p.slug).join(', '));
}
export async function checkpoints(c: Context,p: any): Promise<any[]> {
  const {data,error}=await scoped(c,'checkpoints').eq('project_id',p.id).order('position');
  if(error) throw new Error(error.message);
  return data||[];
}
export async function checkpoint(c: Context,p: any, code?: string): Promise<any> {
  const items=await checkpoints(c,p);
  if (!code) return items.find((x:any)=>x.status==='in_progress') || items.find((x:any)=>x.status==='not_started') || null;
  const found=items.find((x:any)=>x.code.toLowerCase()===code.toLowerCase());
  if(!found) throw new Error('No checkpoint '+code+'. Valid: '+items.map((x:any)=>x.code).join(', '));
  return found;
}
export async function session(c: Context,p: any, code: string): Promise<any> {
  const match=/^S(\d+)$/i.exec(code);
  if(!match) throw new Error('Session must be S plus a number, e.g. S8');
  const {data,error}=await scoped(c,'sessions').eq('project_id',p.id).eq('number',Number(match[1])).maybeSingle();
  if(error) throw new Error(error.message);
  if(!data) throw new Error('No session '+code+' in '+p.slug);
  return data;
}
export async function source(c: Context,p:any,short?:string):Promise<any> {
  const {data,error}=await scoped(c,'sources').eq('project_id',p.id).order('created_at').limit(100);
  if(error)throw new Error(error.message);
  const items=data||[];
  const hit=short?items.find((x:any)=>x.short===short):items[0];
  if(!hit)throw new Error('Source not found. Sources: '+items.map((x:any)=>x.short).join(', '));
  return hit;
}