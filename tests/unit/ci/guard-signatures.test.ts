import {describe,expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
// @ts-expect-error plain ESM script
import {normalizeError,parseJUnit,signaturesFromDir,jobKind} from '../../../scripts/ci/signatures.mjs'
// @ts-expect-error plain ESM script
import {prune} from '../../../scripts/ci/incident.mjs'
// @ts-expect-error plain ESM script
import {noProgressStats,shouldEscalate} from '../../../scripts/ci/sweep.mjs'
// @ts-expect-error plain ESM script
import {addRevertedLine} from '../../../scripts/ci/revert.mjs'
// @ts-expect-error plain ESM script
import {aggregate,renderMarkdown} from '../../../scripts/ci/calibrate.mjs'

const vitestXml=`<testsuites><testsuite name="tests/unit/a.test.ts" tests="2">
<testcase classname="tests/unit/a.test.ts" name="suite &gt; passes" time="0.001"></testcase>
<testcase classname="tests/unit/a.test.ts" name="suite &gt; fails" time="0.5"><failure message="expected 42 to be 43 // Object.is equality" type="AssertionError">trace</failure></testcase>
</testsuite></testsuites>`
const pwXml=`<testsuites><testsuite name="stress.spec.ts"><testcase name="ST-0 budget" classname="stress.spec.ts" time="9.1"><failure message="expect(received).toBeLessThan(expected)"><![CDATA[  Error: expect(received).toBeLessThan(expected)
 Received: 5123]]></failure></testcase></testsuite></testsuites>`

describe('failure signatures',()=>{
 it('normalizes numbers, hashes, timestamps and paths so the same failure matches across PRs',()=>{
  const a=normalizeError('expected 4123 to be < 1500 at /root/work/a/b.ts:12:3 (abc1234def) 2026-11-04T01:02:03.456Z')
  const b=normalizeError('expected 9 to be < 8 at /home/runner/x/y.ts:99:1 (0f0f0f0f) 2027-01-01T11:12:13Z')
  expect(a).toBe(b)
  expect(a).not.toMatch(/\d/)
 })
 it('parses vitest and playwright JUnit',()=>{
  const v=parseJUnit(vitestXml)
  expect(v.map((c:any)=>c.failed)).toEqual([false,true])
  expect(v[1].message).toBe('expected 42 to be 43 // Object.is equality')
  const p=parseJUnit(pwXml)
  expect(p[0].file).toBe('stress.spec.ts')
  expect(p[0].message).toContain('toBeLessThan')
 })
 it('builds one signature per failing test with a stable job kind',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sig-'))
  mkdirSync(join(dir,'junit-unit-affected'));mkdirSync(join(dir,'junit-e2e-2-of-4'))
  writeFileSync(join(dir,'junit-unit-affected','unit-unit.xml'),vitestXml)
  writeFileSync(join(dir,'junit-e2e-2-of-4','e2e-e2e-2.xml'),pwXml)
  const sigs=signaturesFromDir(dir)
  expect(sigs.map((s:any)=>s.sig)).toEqual([
   'e2e/stress.spec.ts::ST-0 budget :: expect(received).toBeLessThan(expected)',
   'unit/tests/unit/a.test.ts::suite > fails :: expected N to be N // Object.is equality'])
  expect(jobKind('tests/mcp/x.mjs','sql-1')).toBe('sql')
 })
 it('prunes closed PRs, stale contexts and empty signatures from the registry',()=>{
  const now=Date.parse('2026-11-04T00:00:00Z')
  const data={signatures:{s1:{contexts:{'pr:1':{at:'2026-11-03T00:00:00Z'},'pr:2':{at:'2026-11-03T00:00:00Z'},main:{at:'2026-10-01T00:00:00Z'}}},s2:{contexts:{'pr:9':{at:'2026-11-03T00:00:00Z'}}}}}
  prune(data,new Set([1,2]),now)
  expect(Object.keys(data.signatures)).toEqual(['s1'])
  expect(Object.keys((data.signatures as any).s1.contexts)).toEqual(['pr:1','pr:2'])
 })
})

describe('sweep, revert and calibration helpers',()=>{
 it('escalates only with 3+ No-progress comments from 2+ distinct Agent names',()=>{
  const c=(body:string)=>({body})
  const same=[c('No progress: · Agent: a · tried x'),c('No progress: · Agent: a · tried y'),c('No progress: · Agent: a · tried z')]
  expect(shouldEscalate(noProgressStats(same))).toBe(false)
  const mixed=[...same.slice(0,2),c('No progress: Agent: B · tried w'),c('unrelated')]
  expect(noProgressStats(mixed)).toEqual({total:3,distinct:2})
  expect(shouldEscalate(noProgressStats(mixed))).toBe(true)
  expect(shouldEscalate({total:2,distinct:2})).toBe(false)
 })
 it('adds the Reverted: line as the last line of the item block',()=>{
  const md='# NEXT\n\n## N1 A\nStage: x\nDone = y\n\n## N2 B\nDone = z\n\n(More items.)\n'
  const out=addRevertedLine(md,'1','Reverted: 2026-11-04 — sig')
  expect(out).toContain('Done = y\nReverted: 2026-11-04 — sig\n\n## N2 B')
  expect(addRevertedLine(md,'2','Reverted: d — s')).toContain('Done = z\nReverted: d — s\n\n(More items.)')
  expect(addRevertedLine(md,'9','x')).toBe(md)
 })
 it('calibration: pass rate, median, p10-p90, and quarantine below 95%',()=>{
  const runs=(fails:number)=>Array.from({length:10},(_,i)=>({file:'tests/e2e/x.spec.ts',name:'t',time:(i+1)/10,failed:i<fails,skipped:false}))
  const rows=aggregate([...runs(0),...runs(1).map((c:any)=>({...c,name:'flaky'}))])
  const ok=rows.find((r:any)=>r.name==='t'),flaky=rows.find((r:any)=>r.name==='flaky')
  expect(ok.quarantined).toBe(false);expect(ok.passRate).toBe(1)
  expect(flaky.quarantined).toBe(true);expect(flaky.passRate).toBe(0.9)
  expect(ok.medianMs).toBeGreaterThan(400);expect(ok.p10Ms).toBeLessThan(ok.p90Ms)
  expect(renderMarkdown(rows,{run:'1',sha:'abc',date:'2026-11-04',n:'10'})).toContain('quarantined')
 })
})
