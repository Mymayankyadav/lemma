import type {ExamSitting} from '../../../supabase/functions/_shared/exam/plan';
import type {Context} from '../../../supabase/functions/mcp/db';

export const owner = '11111111-1111-4111-8111-111111111111';
export const other = '22222222-2222-4222-8222-222222222222';
export const now = '2026-11-25T10:00:00.000Z';
export const examProject = {
  id:'linear', user_id:owner, slug:'linear-algebra', title:'Linear Algebra', subject_id:'math', system:false,
  status:'active', goal:'Study eigenvectors', style:'socratic',
};
export function sitting(patch:Partial<ExamSitting> = {}, project:RecordRow = examProject) {
  return {
    id:'sitting', user_id:project.user_id, project_id:project.id, projects:project, title:'Linear algebra final',
    status:'active', phase:'screen', card_mode:'later', time_zone:'Asia/Kolkata',
    starts_at:'2026-11-27T04:00:00.000Z', duration_minutes:180, total_marks:60, study_minutes:600,
    study_minutes_set_at:now, activation_study_minutes:600, finished_at:null, version:1, blueprint_version:1,
    blueprint:[{key:'diag',title:'Justify diagonalizability',marks:20,concepts:['eigenvalues']},
      {key:'proj',title:'Compute an orthogonal projection',marks:15,concepts:['projections']}],
    ledger:{diag:{disposition:'probe'}}, bookmark:{checkpoint:'CP4',step:2,steps:3,session:7,question:'Find an eigenbasis.'},
    ...patch,
  };
}

type RecordRow = Record<string, unknown>;
type Filter = [operator:string, key:string, value:unknown];
type Read = {table:string; filters:Filter[]; range?:[number,number]; limit?:number; head?:boolean};
type Result = {data:unknown;error:{message:string}|null;count?:number};
const field = (row:RecordRow,key:string) => key.split('.').reduce<unknown>((value,k)=>(value as RecordRow|undefined)?.[k],row);
const compare = (a:unknown,b:unknown) => a === b ? 0 : String(a) < String(b) ? -1 : 1;

/** The mock applies each recorded predicate before paginating and does not assume tenant RLS. */
export function examFixture(overrides:Record<string,RecordRow[]> = {}, options:{
  fail?:string; rpc?:(name:string,args?:RecordRow)=>Result;
} = {}) {
  const tables = {
    settings:[{user_id:owner, master_prompt:'Owner asks for exact reasoning.', time_zone:'Asia/Kolkata', flags:{}}],
    projects:[examProject],
    exam_sittings:[sitting()],
    ...overrides,
  } as Record<string,RecordRow[]>;
  const reads:Read[] = [];
  const rpcCalls:Array<[string,RecordRow|undefined]> = [];
  function from(table:string) {
    const read:Read = {table,filters:[]};
    reads.push(read);
    const tests: Array<(row:RecordRow)=>boolean> = [];
    const orders: Array<{key:string; ascending?:boolean; nullsFirst?:boolean}> = [];
    const add = (op:string,key:string,value:unknown,test:(v:unknown)=>boolean) => {
      read.filters.push([op,key,value]);
      tests.push(row=>test(field(row,key)));
      return query;
    };
    const execute = (single:boolean):Result => {
      if (options.fail === table) return {data:null,error:{message:'Fixture lookup failed'}};
      const rows = (tables[table] ?? []).filter(row=>tests.every(test=>test(row)));
      const count = rows.length;
      rows.sort((a,b)=>{
        for (const {key,ascending=true,nullsFirst=false} of orders) {
          const av=field(a,key), bv=field(b,key);
          if (av==null && bv!=null) return nullsFirst ? -1 : 1;
          if (av!=null && bv==null) return nullsFirst ? 1 : -1;
          const result=compare(av,bv)*(ascending ? 1 : -1);
          if (result) return result;
        }
        return 0;
      });
      const [start,end]=read.range ?? [0,999];
      const page=rows.slice(start,Math.min(end+1,start+(read.limit ?? 1000)));
      return {data:read.head ? null : single ? page[0] ?? null : page,error:null,count};
    };
    const query = {
      select:(_columns:string, opts?:{head?:boolean})=>{read.head=opts?.head; return query;},
      eq:(key:string,value:unknown)=>add('eq',key,value,item=>item===value),
      neq:(key:string,value:unknown)=>add('neq',key,value,item=>item!==value),
      is:(key:string,value:unknown)=>add('is',key,value,item=>item===value),
      in:(key:string,values:unknown[])=>add('in',key,values,item=>values.includes(item)),
      gte:(key:string,value:unknown)=>add('gte',key,value,item=>item!=null&&compare(item,value)>=0),
      lte:(key:string,value:unknown)=>add('lte',key,value,item=>item!=null&&compare(item,value)<=0),
      or:(value:string)=>{
        read.filters.push(['or','',value]);
        const choices = /status\.in\.\(([^)]+)\)/.exec(value)?.[1].split(',') ?? [];
        const cutoff = /finished_at\.gte\.(.+)\)$/.exec(value)?.[1];
        tests.push(row=>choices.includes(String(row.status)) ||
          (row.status==='finished'&&cutoff!==undefined&&compare(row.finished_at,cutoff)>=0));
        return query;
      },
      order:(key:string,opts?:{ascending?:boolean;nullsFirst?:boolean})=>{orders.push({key,...opts}); return query;},
      limit:(value:number)=>{read.limit=value;return query;},
      range:(start:number,end:number)=>{read.range=[start,end];return query;},
      maybeSingle:()=>Promise.resolve(execute(true)),
      then:<T>(resolve:(value:Result)=>T)=>Promise.resolve(execute(false)).then(resolve),
    };
    return query;
  }
  const context:Context = {userId:owner,db:{from,rpc:async(name,args)=>{
    rpcCalls.push([name,args]);
    return options.rpc ? options.rpc(name,args) : {data:name==='exam_row_evidence' ? [] : false,error:null};
  }}};
  return {context,reads,rpcCalls};
}
