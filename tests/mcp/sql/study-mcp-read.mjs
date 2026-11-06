// N15: run against PGlite only; no production connection or migration writes.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {register} from 'node:module';

// The existing pinned tsx dev dependency allows importing the same pure TS
// handler used by the Edge Function; no mock copy of the read algorithm.
register('tsx/esm', import.meta.url);
const {readStudyRecords}=await import('../../../supabase/functions/mcp/tools/study-read.ts');
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-1111-1111-111111111111';
const other='99999999-9999-9999-9999-999999999999';
const range={start:'2026-11-05T00:00:00Z',end:'2026-11-06T00:00:00Z'};
const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
const as=async(id)=>{
  await db.exec('reset role');
  await q("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role authenticated');
};
let operation=0;
const command=async(resource,action,patch,target=null,expectedVersion=null)=>{
  operation++;
  const operationId='aaaa0000-0000-4000-a000-'+String(operation).padStart(12,'0');
  const request={operationId,schemaVersion:1,resource,operation:action};
  if(patch!==null)request.patch=patch;
  if(target!==null)request.target={id:target};
  if(expectedVersion!==null)request.expectedVersion=expectedVersion;
  const receipt=(await q('select public.study_command($1::jsonb) result',[JSON.stringify(request)]))[0].result;
  assert.equal(receipt.status,'ok');
  return receipt.changed[0];
};

/**
 * Minimal SQL-backed PostgREST query adapter. Actual readStudyRecords is called
 * unchanged, and filters/count/order/page execute on the migrated PGlite tables.
 * Table and column selectors are limited to the N15 fixed allowlist.
 */
function sqlContext(userId){
  const calls=[];
  const allowed={
    study_entries:new Set(['id','user_id','created_at','intent']),
    calendar_blocks:new Set(['id','user_id','starts_at','ends_at','title']),
    study_intervals:new Set(['id','user_id','entry_id','started_at']),
  };
  return {
    userId,
    calls,
    db:{from(table){
      assert.ok(allowed[table], 'unexpected table '+table);
      const filters=[],sort=[];
      let offset=0,limit=50,intervalStart=null,intervalEnd=null;
      const col=(name)=>{
        assert.ok(allowed[table].has(name),'unexpected column '+name);
        return 'src."'+name+'"';
      };
      const query={
        select(){return query},
        eq(column,value){filters.push([col(column)+' = ?',value]);return query},
        lt(column,value){
          if(column==='study_intervals.started_at'){
            assert.equal(table,'study_entries');
            intervalStart=value;
          }else filters.push([col(column)+' < ?',value]);
          return query;
        },
        gt(column,value){filters.push([col(column)+' > ?',value]);return query},
        or(condition,options){
          assert.equal(options.referencedTable,'study_intervals');
          assert.equal(table,'study_entries');
          assert.match(condition,/^ended_at\.is\.null,ended_at\.gt\./);
          intervalEnd=condition.slice('ended_at.is.null,ended_at.gt.'.length);
          return query;
        },
        ilike(column,value){filters.push([col(column)+' ilike ?',value]);return query},
        in(column,values){
          assert.ok(values.length>0 && values.length<=50);
          filters.push([col(column)+' in ('+values.map(()=>'?').join(',')+')',...values]);
          return query;
        },
        order(column,opts){sort.push([col(column),opts?.ascending!==false]);return query},
        range(a,b){offset=a;limit=b-a+1;return query},
        limit(n){offset=0;limit=n;return query},
        then(resolve,reject){
          return (async()=>{
            const params=[],where=[];
            for(const [sql,...vals] of filters){
              // Build each placeholder using the evolving parameter length.
              let position=params.length;
              where.push(sql.replace(/\?/g,()=>'$'+(++position)));
              params.push(...vals);
            }
            if(intervalStart!==null && intervalEnd!==null){
              const a=params.push(intervalStart),b=params.push(intervalEnd);
              where.push('exists (select 1 from public.study_intervals i where i.entry_id=src.id and i.user_id=src.user_id and i.started_at < $'+a+' and (i.ended_at is null or i.ended_at > $'+b+'))');
            }
            const predicate=where.length?' where '+where.join(' and '):'';
            const from=' from public."'+table+'" src';
            const countRows=await q('select count(*)::int n'+from+predicate,params);
            const order=sort.length?' order by '+sort.map(([column,asc])=>column+(asc?' asc':' desc')).join(', '):'';
            const data=await q('select src.*'+from+predicate+order+' limit '+limit+' offset '+offset,params);
            calls.push({table,userId,filters:where,offset,limit});
            return {data,error:null,count:countRows[0].n};
          })().then(resolve,reject);
        },
      };
      return query;
    }},
  };
}

try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(repeat('00',n),'hex')$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const dir=new URL('../../../supabase/migrations/',import.meta.url);
  for (const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')&&!x.includes('_storage')).sort())
    await db.exec(await readFile(new URL(file,dir),'utf8'));
  await q('insert into auth.users(id) values ($1),($2)',[owner,other]);
  await as(owner);

  const first=await command('study_entries','create',{source:'manual',intent:'Proof of theorem A'});
  const second=await command('study_entries','create',{source:'manual',intent:'Proof of theorem B'});
  const firstInterval=await command('study_intervals','create',{
    entry_id:first.id,kind:'focus',started_at:'2026-11-04T23:30:00Z',
    ended_at:'2026-11-05T00:45:00Z',
  });
  await command('study_intervals','create',{
    entry_id:second.id,kind:'focus',started_at:'2026-11-05T08:00:00Z',
    ended_at:'2026-11-05T08:30:00Z',
  });
  const savedBlock=await command('calendar_blocks','create',{
    kind:'study',title:'Study theorem',starts_at:'2026-11-05T10:00:00Z',
    ends_at:'2026-11-05T11:00:00Z',time_zone:'UTC',
  });

  const user=sqlContext(owner);
  const page1=JSON.parse(await readStudyRecords(user,{what:'study_entries',...range,limit:1},'get'));
  assert.equal(page1.total,2,'total is exact, not current page size');
  assert.equal(page1.items.length,1);
  assert.equal(page1.items[0].intervals.length,1,'get includes the persisted interval');
  assert.equal(page1.nextCursor,'v1:1');
  const page2=JSON.parse(await readStudyRecords(user,{
    what:'study_entries',...range,limit:1,cursor:page1.nextCursor,
  },'get'));
  assert.equal(page2.total,2);
  assert.equal(page2.items.length,1);
  assert.equal(page2.nextCursor,null);
  assert.equal(new Set([...page1.items,...page2.items].map(x=>x.id)).size,2);
  assert.equal([...page1.items,...page2.items].find(x=>x.id===first.id).version,firstInterval.version,
    'get exposes the version returned by study_command');
  const found=JSON.parse(await readStudyRecords(user,{
    resource:'study_entries',query:'theorem',...range,
  },'search'));
  assert.equal(found.total,2);
  assert.equal(found.items.find(x=>x.id===first.id).version,firstInterval.version);
  const blocks=JSON.parse(await readStudyRecords(user,{
    what:'calendar_blocks',...range,
  },'get'));
  assert.equal(blocks.total,1);
  assert.equal(blocks.items[0].id,savedBlock.id);
  assert.equal(blocks.items[0].version,savedBlock.version);
  const searchedBlock=JSON.parse(await readStudyRecords(user,{
    resource:'calendar_blocks',query:'theorem',...range,
  },'search'));
  assert.equal(searchedBlock.items[0].id,savedBlock.id);

  await as(other);
  const secret=await command('study_entries','create',{source:'manual',intent:'Secret theorem'});
  await command('study_intervals','create',{
    entry_id:secret.id,kind:'focus',started_at:'2026-11-05T12:00:00Z',
    ended_at:'2026-11-05T12:30:00Z',
  });
  await command('calendar_blocks','create',{
    kind:'study',title:'Private theorem',starts_at:'2026-11-05T10:00:00Z',
    ends_at:'2026-11-05T11:00:00Z',time_zone:'UTC',
  });
  const otherContext=sqlContext(other);
  const otherRead=JSON.parse(await readStudyRecords(otherContext,{what:'study_entries',...range},'get'));
  assert.deepEqual(otherRead.items.map(x=>x.id),[secret.id]);
  assert.equal(otherRead.total,1);
  await as(owner);
  const again=JSON.parse(await readStudyRecords(sqlContext(owner),{
    resource:'study_entries',query:'theorem',...range,
  },'search'));
  assert.equal(again.total,2,'another owner has not joined the search result');
  assert.ok(again.items.every(x=>x.id!==secret.id));
  const visibleBlocks=JSON.parse(await readStudyRecords(sqlContext(owner),{
    resource:'calendar_blocks',query:'theorem',...range,
  },'search'));
  assert.equal(visibleBlocks.total,1);
  assert.equal(visibleBlocks.items[0].id,savedBlock.id);
  assert.ok(user.calls.every(call=>call.filters.some(filter=>filter.includes('src."user_id"'))),
    'each read, including interval fetches, filters by authenticated owner');
  console.log('N15 study MCP get/search SQL acceptance passed');
} finally {
  await db.close();
}
