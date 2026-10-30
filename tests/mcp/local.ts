// Full connector selftest against isolated PostgreSQL. External PGlite module only.
import {selftest} from '../../supabase/functions/mcp/selftest.ts';
const {PGlite}=await import(Deno.env.get('PGLITE_MODULE')!);
const db=new PGlite();const userId='11111111-1111-1111-1111-111111111111';
class Query {
 table:string;op='select';values:any;projection='*';conditions:string[]=[];params:any[]=[];sort='';count=1000;one='';
 constructor(t:string){this.table=t;}
 param(v:any){this.params.push(typeof v==='object'&&v!==null?JSON.stringify(v):v);return '$'+this.params.length;}
 select(s='*'){this.projection=s;return this;} insert(v:any){this.op='insert';this.values=v;return this;}update(v:any){this.op='update';this.values=v;return this;}delete(){this.op='delete';return this;}
 filter(k:string,op:string,v:any){if(!/^[a-z_]+$/.test(k))throw Error('Invalid test column');if(op==='is')this.conditions.push('"'+k+'" is '+(v===null?'null':String(v)));else this.conditions.push('"'+k+'" '+op+' '+this.param(v));return this;}
 eq(k:string,v:any){return this.filter(k,'=',v);}neq(k:string,v:any){return this.filter(k,'<>',v);}gte(k:string,v:any){return this.filter(k,'>=',v);}lte(k:string,v:any){return this.filter(k,'<=',v);}ilike(k:string,v:any){return this.filter(k,'ilike',v);}is(k:string,v:any){return this.filter(k,'is',v);}
 in(k:string,v:any[]){this.conditions.push(v.length?'"'+k+'" in ('+v.map(x=>this.param(x)).join(',')+')':'false');return this;}
 textSearch(k:string,v:string){this.conditions.push('"'+k+'" @@ plainto_tsquery(\'english\','+this.param(v)+')');return this;}
 order(k:string,o:any={}){this.sort=' order by "'+k+'" '+(o.ascending===false?'desc':'asc');return this;}limit(n:number){this.count=n;return this;}single(){this.one='single';return this;}maybeSingle(){this.one='maybe';return this;}
 then(resolve:any,reject:any){return this.run().then(resolve,reject);}
 async run(){try{let sql='';const table='public."'+this.table+'"';if(this.op==='select')sql='select '+this.projection+' from '+table;else if(this.op==='insert'){const rows=Array.isArray(this.values)?this.values:[this.values],keys=Object.keys(rows[0]);sql='insert into '+table+' ('+keys.map(k=>'"'+k+'"').join(',')+') values '+rows.map(r=>'('+keys.map(k=>this.param(r[k])).join(',')+')').join(',');}else if(this.op==='update')sql='update '+table+' set '+Object.keys(this.values).map(k=>'"'+k+'"='+this.param(this.values[k])).join(',');else sql='delete from '+table;
 if(this.conditions.length)sql+=' where '+this.conditions.join(' and ');if(this.op==='select')sql+=this.sort+' limit '+this.count;else sql+=' returning '+this.projection;const raw=await db.query(sql,this.params);const rows=JSON.parse(JSON.stringify(raw.rows));if(this.one==='single'&&rows.length!==1)throw Error('Expected single '+this.table+' row, got '+rows.length);return {data:this.one?rows[0]||null:rows,error:null};}catch(e){return {data:null,error:{message:(e as Error).message}};}}
}
const client={from:(t:string)=>new Query(t),rpc:async(fn:string,args:any={})=>{try{const keys=Object.keys(args);const values=keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]);const r=await db.query('select public."'+fn+'"('+keys.map((k,i)=>'"'+k+'" => $'+(i+1)).join(',')+') result',values);return {data:r.rows[0].result,error:null};}catch(e){return {data:null,error:{message:(e as Error).message}};}}};
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','${userId}')::uuid$$;create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;insert into auth.users values('${userId}');`);
 for(const f of ['20261029164215_lemma_tables.sql','20261029164314_lemma_triggers.sql','20261029164323_lemma_rls.sql','20261029164341_lemma_functions.sql','20261029165642_lemma_atomic_progress.sql','20261029183249_action_log.sql','20261029190752_mcp_transactions.sql'])await db.exec(await Deno.readTextFile('supabase/migrations/'+f));
 await db.exec('select public.bootstrap()');const result=await selftest({db:client,userId});for(const s of result.steps)console.log((s.ok?'PASS ':'FAIL ')+s.name+(s.detail?': '+s.detail:''));if(!result.ok)throw Error('Connector selftest failed');
}finally{await db.close();}

Deno.exit(0);
