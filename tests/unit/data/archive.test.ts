import {beforeEach,describe,expect,it,vi} from 'vitest'
import {LiveAdapter} from '../../../src/data/live/adapter'
import {liveClient} from '../../../src/data/live/client'
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}))
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url',()=>({default:'worker'}))
const data:Record<string,any[]>={}
const client={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},
 rpc(name:string){
  if(name==='home_summary'){
   // The server-side summary excludes archived and system sessions before
   // selecting the most recently active resume target.
   const visible=(data.projects??[]).filter(p=>p.user_id==='owner'&&!p.system&&p.status!=='archived')
   const sessions=(data.sessions??[]).filter(s=>visible.some(p=>p.id===s.project_id)&&s.state!=='ended')
    .sort((a,b)=>b.last_activity_at.localeCompare(a.last_activity_at))
   const project=visible.find(p=>p.id===sessions[0]?.project_id)??visible[0]
   return Promise.resolve({data:{resume:project?{projectSlug:project.slug}:null,
    projects:visible,due:0,pendingProposals:0},error:null})
  }
  if(name!=='project_summaries')throw new Error('Unexpected RPC '+name)
  // The server RPC hides system projects but deliberately retains archived ones.
  const result=(data.projects??[]).filter(p=>p.user_id==='owner'&&!p.system)
   .map(p=>({...p,subject:{id:'sub',name:'Math',glyph:'M',hue:'amber',position:0},
    lastActivityAt:p.last_activity_at,current:null,done:0,total:0,cardsCount:0,
    sessionsCount:0,sourcesCount:0,sourceTitles:[]}))
   .sort((a,b)=>b.lastActivityAt.localeCompare(a.lastActivityAt))
  return Promise.resolve({data:result,error:null})
 },
 from(table:string){
 let result=(data[table]??[]).slice()
 const q:any={select(){return q},eq(k:string,v:any){result=result.filter(r=>r[k]===v);return q},neq(k:string,v:any){result=result.filter(r=>r[k]!==v);return q},range(start:number,end:number){return Promise.resolve({data:result.slice(start,end+1),error:null})},single(){return Promise.resolve(result.length===1?{data:result[0],error:null}:{data:null,error:{code:'PGRST116',message:'No row'}})}};return q
}}
beforeEach(()=>{Object.keys(data).forEach(k=>delete data[k]);vi.mocked(liveClient).mockReturnValue(client as any);
 data.projects=[{id:'sys',user_id:'owner',slug:'system-test',title:'Self test',status:'active',system:true,subject_id:'sub',last_activity_at:'2026-03-01'},{id:'active',user_id:'owner',slug:'visible',title:'Visible',status:'active',subject_id:'sub',last_activity_at:'2026-01-01'},{id:'archived',user_id:'owner',slug:'hidden',title:'Hidden',status:'archived',subject_id:'sub',last_activity_at:'2026-02-01'}];
 data.subjects=[{id:'sub',user_id:'owner',name:'Math',glyph:'M',hue:'amber'}];
 data.sessions=[{id:'sys',user_id:'owner',project_id:'sys',number:3,state:'open',started_at:'2026-03-01',last_activity_at:'2026-03-01'},{id:'a',user_id:'owner',project_id:'active',number:1,state:'open',started_at:'2026-01-01',last_activity_at:'2026-01-01'},{id:'b',user_id:'owner',project_id:'archived',number:2,state:'open',started_at:'2026-02-01',last_activity_at:'2026-02-01'}]
})
describe('live archive visibility',()=>{
 it('shows archived projects only in the library, not sessions or resume, and excludes system projects',async()=>{
  const api=new LiveAdapter();vi.spyOn(api,'getSettings').mockResolvedValue({timeZone:'UTC',rolloverHour:4} as any)
  expect((await api.listProjects()).map(p=>p.slug)).toEqual(['hidden','visible'])
  expect((await api.listSessions()).map(s=>s.projectSlug)).toEqual(['visible'])
  expect(await api.listSessions('hidden')).toEqual([])
  await expect(api.getProject('hidden')).rejects.toMatchObject({code:'not_found'})
  await expect(api.getProject('system-test')).rejects.toMatchObject({code:'not_found'})
  expect(data.projects).toHaveLength(3)
 })
 it('never chooses an archived session as the home resume target',async()=>{
  const api=new LiveAdapter();vi.spyOn(api,'getSettings').mockResolvedValue({timeZone:'UTC',rolloverHour:4} as any)
  vi.spyOn(api,'listProposals').mockResolvedValue([]);vi.spyOn(api,'getReviewItems').mockResolvedValue([])
  vi.spyOn(api,'getProject').mockResolvedValue({checkpoints:[]} as any)
  vi.spyOn(api,'getSession').mockResolvedValue({resumeStep:0,resumeQuestion:null} as any)
  expect((await api.getHome()).resume?.projectSlug).toBe('visible')
 })
})
