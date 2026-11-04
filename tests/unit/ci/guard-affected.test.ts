import {describe,expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
// @ts-expect-error plain ESM script
import {computeAffected,buildGraph} from '../../../scripts/ci/affected.mjs'

function repo(files:Record<string,string>){
 const root=mkdtempSync(join(tmpdir(),'aff-'))
 for(const [f,t] of Object.entries(files)){mkdirSync(join(root,dirname(f)),{recursive:true});writeFileSync(join(root,f),t)}
 return root
}
const map={
 all:['package.json','src/lib/**','.github/**'],ignore:['*.md','docs/**'],smoke:['tests/e2e/smoke.spec.ts'],
 groups:[{name:'atlas',src:['src/features/atlas/**'],unit:['tests/unit/atlas/**'],e2e:['tests/e2e/atlas.spec.ts','tests/e2e/smoke.spec.ts','tests/e2e/stress.spec.ts']},
  {name:'db',src:['supabase/migrations/**'],unit:[],e2e:[],sql:true}]}
const perf={e2e:[{path:'tests/e2e/stress.spec.ts'}],unit:[],sql:[]}
const files={
 'src/features/atlas/Page.tsx':"import {x} from '../../lib/x'\nexport const p=x",
 'src/lib/x.ts':'export const x=1',
 'src/features/home/Page.tsx':"import {h} from './helper'\nexport const p=h",
 'src/features/home/helper.ts':'export const h=1',
 'tests/unit/atlas/a.test.ts':"import {p} from '../../../src/features/atlas/Page'\n",
 'tests/unit/home/h.test.ts':"import {p} from '../../../src/features/home/Page'\n",
 'tests/unit/misc/reads.test.ts':"import {readFileSync} from 'node:fs'\nreadFileSync('src/lib/x.ts','utf8')\n",
 'tests/e2e/atlas.spec.ts':'','tests/e2e/smoke.spec.ts':'','tests/e2e/stress.spec.ts':'','tests/e2e/other.spec.ts':'',
 'supabase/migrations/1.sql':'select 1',
}
describe('affected test selection',()=>{
 const root=repo(files)
 const run=(changed:string[])=>computeAffected({changed,root,map,perf})
 it('shared code runs everything (minus perf and smoke e2e)',()=>{
  const r=run(['src/lib/x.ts'])
  expect(r.all).toBe(true)
  expect(r.unit).toHaveLength(3)
  expect(r.e2e).toEqual(['tests/e2e/atlas.spec.ts','tests/e2e/other.spec.ts'])
  expect(r.sql).toBe(true)
 })
 it('a feature change runs its group, plus unit tests found by the import graph',()=>{
  const r=run(['src/features/home/helper.ts'])
  expect(r.all).toBe(false)
  expect(r.unit).toEqual(['tests/unit/home/h.test.ts'])
  expect(r.e2e).toEqual([])
  const a=run(['src/features/atlas/Page.tsx'])
  expect(a.unit).toEqual(['tests/unit/atlas/a.test.ts'])
  expect(a.e2e).toEqual(['tests/e2e/atlas.spec.ts'])
 })
 it('follows repo paths read by tests, and treats docs as no-impact',()=>{
  expect(run(['README.md','docs/x.md'])).toMatchObject({all:false,unit:[],e2e:[],sql:false})
  const g=buildGraph(root)
  expect(g.edges.get('tests/unit/misc/reads.test.ts')?.has('src/lib/x.ts')).toBe(true)
 })
 it('SQL tests run for supabase changes; unknown files run everything',()=>{
  expect(run(['supabase/migrations/1.sql']).sql).toBe(true)
  const u=run(['tools/mystery.bin'])
  expect(u.all).toBe(true)
  expect(u.reasons[0]).toContain('unsure')
 })
 it('changed tests and specs run themselves',()=>{
  const r=run(['tests/unit/home/h.test.ts','tests/e2e/other.spec.ts'])
  expect(r.unit).toEqual(['tests/unit/home/h.test.ts'])
  expect(r.e2e).toEqual(['tests/e2e/other.spec.ts'])
 })
})
