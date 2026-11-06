// N34: MCP task parity and undo acceptance against migrated PGlite only.
// This test never opens a production Supabase connection.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {tsImport} from 'tsx/esm/api';

const {readTaskRecords}=await tsImport('../../../supabase/functions/mcp/tools/task-read.ts',import.meta.url);
const {study}=await tsImport('../../../supabase/functions/mcp/tools/study.ts',import.meta.url);
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const role=async(name)=>{
  await db.exec('reset role');
  await q("select set_config('test.uid','',false)");
  if(name)await db.exec('set role '+name);
};
const as=async(id)=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role authenticated');
};
let operation=0;
const command=(operationName,extra={})=>({
  operationId:'bbbb0000-0000-4000-8000-'+String(++operation).padStart(12,'0'),
  schemaVersion:1,resource:'tasks',operation:operationName,...extra
});
const direct=async(commandValue)=>(await q(
  'select public.task_command($1::jsonb) result',[JSON.stringify(commandValue)]
))[0].result;
// The real MCP handler invokes this RPC with the owner bound from Context, not
// from the command, and returns the database receipt without modifying it.
function bridgeContext(userId){
  return {userId,db:{rpc:async(name,args)=>{
    assert.equal(name,'mcp_task_command','N34 must use the task-specific owner-bound bridge');
    const result=(await q('select public.mcp_task_command($1::uuid,$2::text,$3::jsonb) result',
      [args.p_user,args.p_source,JSON.stringify(args.p)]))[0].result;
    return {data:result,error:null};
  }}};
}
// Minimal PostgREST adapter: the real MCP read handler runs unchanged, while
// its filters, exact count, order and range run in PostgreSQL.
function readContext(userId){
  const calls=[];
  const allowed=new Set(['user_id','status','title','position','created_at','id']);
  return {userId,calls,db:{from(table){
    assert.equal(table,'tasks');
    const filters=[],sort=[],params=[];
    let offset=0,limit=20;
    const col=(name)=>{
      assert.ok(allowed.has(name),'unexpected column: '+name);
      return 'src."'+name+'"';
    };
    const predicate=(column,operator,value)=>{
      filters.push(col(column)+' '+operator+' $'+(params.length+1));
      params.push(value);
    };
    const query={
      select(_columns,opts){assert.equal(opts.count,'exact');return query},
      eq(column,value){predicate(column,'=',value);return query},
      ilike(column,pattern){predicate(column,'ilike',pattern);return query},
      order(column,options){sort.push(col(column)+(options?.ascending===false?' desc':' asc'));return query},
      range(a,b){offset=a;limit=b-a+1;return query},
      then(resolve,reject){
        return (async()=>{
          const where=filters.length?' where '+filters.join(' and '):'';
          const order=sort.length?' order by '+sort.join(', '):'';
          const count=(await q('select count(*)::int n from public.tasks src'+where,params))[0].n;
          const data=await q('select src.* from public.tasks src'+where+order+
            ' limit '+limit+' offset '+offset,params);
          calls.push({filters,offset,limit,count});
          return {data,count,error:null};
        })().then(resolve,reject);
      }
    };
    return query;
  }}};
}
const undo=async(user,actionNo)=>(await q(
  'select public.undo_action($1::uuid,$2::bigint,false) result',[user,actionNo]
))[0].result;

try{
  await db.exec([
    'create role anon; create role authenticated; create role service_role;',
    'create schema auth; create schema extensions; create table auth.users(id uuid primary key);',
    "create function auth.uid() returns uuid language sql as $auth$ select coalesce(nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'sub','')::uuid,nullif(current_setting('test.uid',true),'')::uuid) $auth$;",
    "create function extensions.gen_random_bytes(n int) returns bytea language sql as $bytes$select decode(repeat('00',n),'hex')$bytes$;",
    'grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;'
  ].join('\n'));
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort();
  assert.ok(files.some(x=>x.endsWith('_v6_task_command.sql')));
  for(const file of files)await db.exec(await readFile(new URL(file,dir),'utf8'));
  await q('insert into auth.users(id) values ($1),($2)',[owner,other]);
  await q('insert into public.settings(user_id,connector_secret) values ($1,$2)',
    [owner,'1'.repeat(48)]);
  await q('insert into public.settings(user_id,connector_secret) values ($1,$2)',
    [other,'2'.repeat(48)]);

  // Connector writes a task. The app's authenticated owner query immediately
  // sees the same ID, version and distinct civil-date due kind.
  await role('service_role');
  const created=await study(bridgeContext(owner),{client:'chatgpt',command:command('create',{
    patch:{title:'Write a proof',priority:'high',due_kind:'date',due_date:'2026-11-12'}
  })});
  assert.equal(created.status,'ok');
  assert.ok(created.actionNo>0,'task write is journalled for undo');
  assert.equal(created.changed[0].version,1);
  const id=created.changed[0].id;
  await as(owner);
  const appRows=await q('select id,title,version,due_kind,due_date,due_at from public.tasks where id=$1',[id]);
  assert.equal(appRows.length,1,'MCP create is visible to the live app owner');
  assert.equal(appRows[0].version,created.changed[0].version);
  assert.equal(appRows[0].due_kind,'date');
  assert.equal(appRows[0].due_at,null);

  // Reverse direction: an app-authenticated task_command edit appears through
  // the existing MCP get and search readers with its new optimistic version.
  const edited=await direct(command('update',{
    target:{id},expectedVersion:1,patch:{title:'Revised proof',status:'in_progress'}
  }));
  assert.equal(edited.status,'ok');
  assert.equal(edited.changed[0].version,2);
  await role(null);
  const reader=readContext(owner);
  const first=JSON.parse(await readTaskRecords(reader,{
    what:'tasks',status:'in_progress',limit:1
  },'get'));
  assert.equal(first.total,1);
  assert.equal(first.items[0].id,id);
  assert.equal(first.items[0].version,edited.changed[0].version);
  assert.equal(first.items[0].title,'Revised proof');
  assert.equal(first.items[0].due_kind,'date');
  assert.ok(first.items.every(x=>!('user_id' in x)));
  assert.ok(reader.calls.every(x=>x.filters.some(f=>f.includes('"user_id"'))),
    'MCP reads are owner-filtered before the count and page');

  // A second item establishes real page walking and filtered total.
  await role('service_role');
  const second=await study(bridgeContext(owner),{command:command('create',{
    patch:{title:'Another revised proof',status:'in_progress',position:4}
  })});
  assert.equal(second.status,'ok');
  await role(null);
  const pageOne=JSON.parse(await readTaskRecords(readContext(owner),{
    what:'tasks',status:'in_progress',limit:1
  },'get'));
  assert.equal(pageOne.total,2);
  assert.equal(pageOne.items.length,1);
  assert.equal(pageOne.nextCursor,'v1:1');
  const pageTwo=JSON.parse(await readTaskRecords(readContext(owner),{
    what:'tasks',status:'in_progress',limit:1,cursor:pageOne.nextCursor
  },'get'));
  assert.equal(pageTwo.total,2);
  assert.equal(pageTwo.items.length,1);
  assert.equal(pageTwo.nextCursor,null);
  assert.equal(new Set([...pageOne.items,...pageTwo.items].map(x=>x.id)).size,2);
  const searched=JSON.parse(await readTaskRecords(readContext(owner),{
    resource:'tasks',query:'revised',status:'in_progress'
  },'search'));
  assert.equal(searched.total,2);

  // Another owner can create tasks but cannot see either owner's records.
  await role('service_role');
  const foreign=await study(bridgeContext(other),{client:'claude',command:command('create',{
    patch:{title:'Other revised proof',status:'in_progress'}
  })});
  assert.equal(foreign.status,'ok');
  await role(null);
  const isolated=JSON.parse(await readTaskRecords(readContext(owner),{
    resource:'tasks',query:'revised',status:'in_progress'
  },'search'));
  assert.equal(isolated.total,2);
  assert.ok(isolated.items.every(x=>x.id!==foreign.changed[0].id));
  const privatePage=JSON.parse(await readTaskRecords(readContext(other),{
    what:'tasks',status:'in_progress'
  },'get'));
  assert.deepEqual(privatePage.items.map(x=>x.id),[foreign.changed[0].id]);
  await as(other);
  assert.equal((await q('select count(*)::int n from public.tasks where id=$1',[id]))[0].n,0,
    'live app RLS also prevents cross-owner reads');
  await as(owner);
  await assert.rejects(undo(other,second.actionNo),/Not authorized|not yours/i);

  // Undo via the same undo_action RPC used by the existing MCP undo tool.
  const undone=await undo(owner,second.actionNo);
  assert.equal(undone.undone,second.actionNo);
  assert.equal((await q('select count(*)::int n from public.tasks where id=$1',
    [second.changed[0].id]))[0].n,0);
  await role(null);
  const afterUndo=JSON.parse(await readTaskRecords(readContext(owner),{
    what:'tasks',status:'in_progress'
  },'get'));
  assert.equal(afterUndo.total,1);
  assert.equal(afterUndo.items[0].id,id);
  console.log('PASS N34 MCP task get/search/write parity, owner isolation, paging and undo');
}finally{
  await db.close();
}
