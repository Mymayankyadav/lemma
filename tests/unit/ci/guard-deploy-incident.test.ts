import {describe,expect,it} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
// @ts-expect-error plain ESM script
import {classifyRun,sync,incidentBody,previousRunLines,MARKER} from '../../../scripts/ci/deploy-incident.mjs'
// @ts-expect-error plain ESM script
import {botTokenViolations} from '../../../scripts/ci/lib.mjs'

const step=(name:string,conclusion:string)=>({name,conclusion})
const deployJob=(steps:any[])=>[{name:'deploy',steps}]
const okSteps=[step('Apply migrations','success'),step('Deploy MCP','success'),step('Verify deployed MCP endpoint','success')]
const migrationFail=[step('Apply migrations','failure'),step('Deploy MCP','skipped'),step('Verify deployed MCP endpoint','skipped')]
const noCreds=[step('Check deploy credentials','success'),step('Apply migrations','skipped'),step('Verify deployed MCP endpoint','skipped')]

type Run={id:number,conclusion:string,head_sha:string,created_at:string,head_branch:string,jobs:any[]}
const mkRun=(id:number,conclusion:string,steps:any[],at:string,branch='main'):Run=>({id,conclusion,head_sha:'a'.repeat(7)+id,created_at:at,head_branch:branch,jobs:deployJob(steps)})

/** In-memory GitHub: runs plus issues. Records every write. */
function fake(runs:Run[],issues:any[]=[]){
 const writes:string[]=[]
 let next=900
 const p=(s:string)=>'/repos/o/r'+s
 const gh={
  async get(path:string){
   let m=/\/actions\/workflows\/supabase\.yml\/runs\?branch=(\w+)/.exec(path)
   if(m)return{workflow_runs:runs.filter(r=>r.head_branch===m![1]).map(r=>({id:r.id,conclusion:r.conclusion,head_sha:r.head_sha,created_at:r.created_at,head_branch:r.head_branch}))}
   m=/\/actions\/runs\/(\d+)\/jobs/.exec(path)
   if(m)return{jobs:runs.find(r=>r.id===Number(m![1]))!.jobs}
   m=/\/actions\/runs\/(\d+)$/.exec(path)
   if(m){const r=runs.find(x=>x.id===Number(m![1]))!;return{id:r.id,head_branch:r.head_branch}}
   throw new Error('unexpected GET '+path)
  },
  async list(path:string){
   if(!path.includes('/issues?labels=incident&state=open'))throw new Error('unexpected list '+path)
   return issues.filter(i=>i.state==='open')
  },
  async post(path:string,body:any){
   writes.push('POST '+path)
   if(path.endsWith('/issues')){const i={number:next++,state:'open',title:body.title,body:body.body,labels:body.labels.map((n:string)=>({name:n}))};issues.push(i);return i}
   if(path.endsWith('/labels')){const n=Number(/issues\/(\d+)\//.exec(path)![1]);issues.find(i=>i.number===n).labels.push(...body.labels.map((x:string)=>({name:x})));return{}}
   return{}
  },
  async patch(path:string,body:any){
   writes.push('PATCH '+path)
   const n=Number(/issues\/(\d+)$/.exec(path)![1]);Object.assign(issues.find(i=>i.number===n),body);return{}
  },
 }
 return{gh,p,issues,writes}
}
const go=(f:ReturnType<typeof fake>,runId='',dryRun=false)=>sync({gh:f.gh,p:f.p,runId,dryRun,log:()=>{},repoUrl:'https://github.com/o/r'})

describe('classifyRun',()=>{
 it('names the failed step in the signature',()=>{
  expect(classifyRun({conclusion:'failure'},deployJob(migrationFail))).toMatchObject({kind:'fail',signature:'deploy/supabase:: Apply migrations failed'})
  expect(classifyRun({conclusion:'timed_out'},deployJob([step('Verify deployed MCP endpoint','failure')])).signature).toBe('deploy/supabase:: Verify deployed MCP endpoint failed')
  expect(classifyRun({conclusion:'failure'},[]).signature).toBe('deploy/supabase:: run failure')
 })
 it('counts a success only when MCP verification really ran and passed',()=>{
  expect(classifyRun({conclusion:'success'},deployJob(okSteps)).kind).toBe('deployed')
  expect(classifyRun({conclusion:'success'},deployJob(noCreds)).kind).toBe('ignore')
 })
 it('ignores cancelled and skipped runs',()=>{
  expect(classifyRun({conclusion:'cancelled'},[]).kind).toBe('ignore')
  expect(classifyRun({conclusion:'skipped'},[]).kind).toBe('ignore')
 })
})

describe('deploy incident lifecycle',()=>{
 it('a failed deploy on main opens ONE S0 incident, a second failure updates it, a later success closes it',async()=>{
  const runs=[mkRun(1,'failure',migrationFail,'2026-11-03T02:29:40Z')]
  const f=fake(runs)
  const a=await go(f,'1')
  expect(a).toMatchObject({action:'opened',signature:'deploy/supabase:: Apply migrations failed'})
  expect(f.issues).toHaveLength(1)
  expect(f.issues[0].labels.map((l:any)=>l.name).sort()).toEqual(['S0','incident'])
  expect(f.issues[0].body).toContain(MARKER)
  expect(f.issues[0].title).toBe('incident: deploy/supabase:: Apply migrations failed')

  // same event delivered twice: no duplicate, no needless write
  const before=f.writes.length
  expect(await go(f,'1')).toMatchObject({action:'updated'})
  expect(f.issues).toHaveLength(1)
  expect(f.writes.length).toBe(before)

  // another failure, different step: same issue, new title, both runs listed
  runs.push(mkRun(2,'failure',[step('Apply migrations','success'),step('Verify deployed MCP endpoint','failure')],'2026-11-03T05:00:00Z'))
  expect(await go(f,'2')).toMatchObject({action:'updated',number:f.issues[0].number})
  expect(f.issues).toHaveLength(1)
  expect(f.issues[0].title).toBe('incident: deploy/supabase:: Verify deployed MCP endpoint failed')
  expect(previousRunLines(f.issues[0].body).map((l:string)=>/run (\d+)/.exec(l)![1])).toEqual(['2','1'])

  // success that deployed: closed
  runs.push(mkRun(3,'success',okSteps,'2026-11-04T09:00:00Z'))
  expect(await go(f,'3')).toMatchObject({action:'closed'})
  expect(f.issues[0].state).toBe('closed')
 })
 it('a success whose deploy steps were skipped does not close the incident',async()=>{
  const runs=[mkRun(1,'failure',migrationFail,'2026-11-03T02:00:00Z')]
  const f=fake(runs);await go(f,'1')
  runs.push(mkRun(2,'success',noCreds,'2026-11-03T03:00:00Z'))
  expect((await go(f,'2')).action).toBe('none')
  expect(f.issues[0].state).toBe('open')
 })
 it('a cancelled newer run does not close or reopen anything',async()=>{
  const runs=[mkRun(1,'failure',migrationFail,'2026-11-03T02:00:00Z')]
  const f=fake(runs);await go(f,'1')
  runs.push(mkRun(2,'cancelled',[],'2026-11-03T03:00:00Z'))
  expect((await go(f,'2')).action).toBe('ignored-stale')
  expect(f.issues[0].state).toBe('open')
 })
 it('a late event for an older failed run cannot reopen what a newer success closed',async()=>{
  const runs=[mkRun(1,'failure',migrationFail,'2026-11-03T02:00:00Z'),mkRun(2,'success',okSteps,'2026-11-03T03:00:00Z')]
  const f=fake(runs,[])
  expect(await go(f,'1')).toMatchObject({action:'ignored-stale'})
  expect(f.issues).toHaveLength(0)
 })
 it('runs on other branches are ignored',async()=>{
  const f=fake([mkRun(1,'failure',migrationFail,'2026-11-03T02:00:00Z','feature')])
  expect((await go(f)).action).toBe('none')
  expect(f.issues).toHaveLength(0)
 })
 it('with no run id it judges the newest finished run (manual seeding)',async()=>{
  const f=fake([mkRun(1,'success',okSteps,'2026-11-02T06:00:00Z'),mkRun(2,'failure',migrationFail,'2026-11-03T02:29:40Z')])
  expect(await go(f)).toMatchObject({action:'opened',signature:'deploy/supabase:: Apply migrations failed'})
 })
 it('never touches a red-main incident, and a green full suite markers never match a deploy incident',async()=>{
  const mainInc={number:5,state:'open',title:'incident: unit/x::y',body:'<!-- main-incident -->\n**Signature:** x',labels:[{name:'incident'},{name:'S0'}]}
  const f=fake([mkRun(1,'failure',migrationFail,'2026-11-03T02:00:00Z')],[mainInc])
  expect(await go(f,'1')).toMatchObject({action:'opened'})
  expect(f.issues[0].state).toBe('open')
  expect(f.issues[1].body).not.toContain('<!-- main-incident -->')
  const ci=readFileSync('scripts/ci/incident.mjs','utf8')
  expect(ci).toContain("'<!-- main-incident -->'")
  expect(incidentBody({signature:'s',run:{id:1,head_sha:'abcdefg',created_at:'t'},url:'u'})).not.toContain('<!-- main-incident -->')
 })
 it('dry run reads everything and writes nothing',async()=>{
  const f=fake([mkRun(1,'failure',migrationFail,'2026-11-03T02:00:00Z')])
  await go(f,'1',true)
  expect(f.writes).toEqual([])
  expect(f.issues).toHaveLength(0)
 })
 it('repairs missing labels on an existing incident',async()=>{
  const runs=[mkRun(1,'failure',migrationFail,'2026-11-03T02:00:00Z')]
  const f=fake(runs);await go(f,'1')
  f.issues[0].labels=[{name:'incident'}]
  await go(f,'1')
  expect(f.issues[0].labels.map((l:any)=>l.name).sort()).toEqual(['S0','incident'])
 })
})

describe('deploy-incident.yml',()=>{
 const text=readFileSync('.github/workflows/deploy-incident.yml','utf8')
 it('is triggered by the Supabase workflow on main, never by a pull request, and never uses the bot token',()=>{
  expect(text).toMatch(/workflow_run:\s*\n\s*workflows: \[Supabase\]\s*\n\s*types: \[completed\]\s*\n\s*branches: \[main\]/)
  expect(text).not.toMatch(/^\s{2}pull_request(_target)?:/m)
  expect(text).not.toContain('CI_BOT_TOKEN')
  const wf=readdirSync('.github/workflows').filter(n=>n.endsWith('.yml')).map(n=>({name:n,text:readFileSync('.github/workflows/'+n,'utf8')}))
  expect(botTokenViolations(wf)).toEqual([])
 })
 it('needs only issue-write on top of read access and does not cancel queued runs',()=>{
  expect(text).toContain('issues: write')
  expect(text).not.toMatch(/contents: write|pull-requests: write|actions: write/)
  expect(text).toContain('cancel-in-progress: false')
 })
 it('watches the workflow that is really named Supabase',()=>{
  expect(readFileSync('.github/workflows/supabase.yml','utf8').split('\n')[0]).toBe('name: Supabase')
  expect(readFileSync('.github/workflows/supabase.yml','utf8')).toContain('Verify deployed MCP endpoint')
 })
})
