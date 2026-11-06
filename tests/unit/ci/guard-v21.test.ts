import {describe,expect,it} from 'vitest'
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {spawnSync} from 'node:child_process'
import {sameOwnChanges,ownChanges} from '../../../scripts/ci/reuse.mjs'
import {gateRunning} from '../../../scripts/ci/autoresolve.mjs'

const repo=()=>{
 const d=mkdtempSync(join(tmpdir(),'v21-'))
 const g=(...a:string[])=>{const r=spawnSync('git',['-c','user.name=t','-c','user.email=t@t','-c','init.defaultBranch=main',...a],{cwd:d,encoding:'utf8'});if(r.status!==0)throw new Error(a.join(' ')+': '+r.stderr);return r.stdout.trim()}
 const put=(f:string,t:string)=>{mkdirSync(dirname(join(d,f)),{recursive:true});writeFileSync(join(d,f),t)}
 const commit=(m:string)=>{g('add','-A');g('commit','-q','-m',m);return g('rev-parse','HEAD')}
 const run=(args:string[])=>spawnSync('git',args,{cwd:d,encoding:'utf8'})
 g('init','-q');put('CURRENT.md','# c\n');put('NEXT.md','# n\n');put('src/a.ts','a1\n');put('src/shared.ts','s1\nx\nx\nx\nx\ns2\n');commit('base')
 return {g,put,commit,run}
}

describe('v2.1 reuse: the PR own changes decide, not what arrived from main',()=>{
 it('compares own-change maps exactly',()=>{
  const a=new Map([['src/a.ts','b1']])
  expect(sameOwnChanges(a,new Map([['src/a.ts','b1']]))).toBe(true)
  expect(sameOwnChanges(a,new Map([['src/a.ts','b2']]))).toBe(false)
  expect(sameOwnChanges(a,new Map([['src/a.ts','b1'],['src/b.ts','b3']]))).toBe(false)
  expect(sameOwnChanges(new Map(),new Map())).toBe(false)
  expect(sameOwnChanges(new Map([['src/a.ts',null]]),new Map([['src/a.ts',null]]))).toBe(true)
 })
 it('reuses after main is merged in when the PR files are untouched',()=>{
  const r=repo()
  r.g('checkout','-q','-b','pr');r.put('src/a.ts','a2\n');r.put('CURRENT.md','# c\npr\n');const G=r.commit('pr work')
  r.g('checkout','-q','main');r.put('src/b.ts','b\n');r.put('CURRENT.md','# c\nmain\n');const M=r.commit('main moves')
  r.g('checkout','-q','pr');r.run(['-c','user.name=t','-c','user.email=t@t','merge','-q','--no-edit',M]);r.put('CURRENT.md','# c\npr\nmain\n');const H=r.commit('ci: merge main (bookkeeping only: CURRENT.md)')
  const a=ownChanges(G,M,r.run),b=ownChanges(H,M,r.run)
  expect([...a!.keys()]).toEqual(['src/a.ts'])
  expect(sameOwnChanges(a,b)).toBe(true)
 })
 it('runs the tests when a PR file was also changed by main or by the author',()=>{
  const r=repo()
  r.g('checkout','-q','-b','pr');r.put('src/shared.ts','s1-pr\nx\nx\nx\nx\ns2\n');const G=r.commit('pr work')
  r.g('checkout','-q','main');r.put('src/shared.ts','s1\nx\nx\nx\nx\ns2-main\n');const M=r.commit('main edits the same file elsewhere')
  r.g('checkout','-q','pr');r.run(['-c','user.name=t','-c','user.email=t@t','merge','-q','--no-edit',M]);const H=r.g('rev-parse','HEAD')
  expect(sameOwnChanges(ownChanges(G,M,r.run),ownChanges(H,M,r.run))).toBe(false)
  r.put('src/a.ts','a3\n');const H2=r.commit('author pushes more')
  expect(sameOwnChanges(ownChanges(H,M,r.run),ownChanges(H2,M,r.run))).toBe(false)
 })
 it('the PR gate passes the base to the reuse step',()=>{
  const y=readFileSync('.github/workflows/pr-gate.yml','utf8')
  expect(y).toContain('BASE_SHA: ${{ github.event.pull_request.base.sha }}')
 })
})

describe('v2.1 autoresolve waits for a running PR gate',()=>{
 it('detects a run in progress on the same head only',()=>{
  expect(gateRunning([{name:'PR gate',head_sha:'h',status:'in_progress'}],'h')).toBe(true)
  expect(gateRunning([{name:'PR gate',head_sha:'h',status:'queued'}],'h')).toBe(true)
  expect(gateRunning([{name:'PR gate',head_sha:'h',status:'completed'}],'h')).toBe(false)
  expect(gateRunning([{name:'PR gate',head_sha:'old',status:'in_progress'}],'h')).toBe(false)
  expect(gateRunning([{name:'scope',head_sha:'h',status:'in_progress'}],'h')).toBe(false)
  expect(gateRunning(undefined,'h')).toBe(false)
 })
 it('runs again when a PR gate run finishes and may read Actions runs',()=>{
  const y=readFileSync('.github/workflows/autoresolve.yml','utf8')
  expect(y).toContain("workflows: ['scope', 'PR gate']")
  expect(y).toContain('actions: read')
 })
})

describe('v2.1 perf-report never competes with the PR gate for runners',()=>{
 it('runs on main and by hand, not on pull requests',()=>{
  const y=readFileSync('.github/workflows/perf-report.yml','utf8')
  const on=y.slice(y.indexOf('\non:'),y.indexOf('\npermissions:'))
  expect(on).toContain('push:')
  expect(on).toContain('workflow_dispatch:')
  expect(on).not.toContain('pull_request')
 })
})
