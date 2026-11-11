import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,expect,it} from 'vitest'

// FIX #573: keep the complete Playwright suite and screenshot gate required
// even as the number of stress and Graph-theme cases grows.
const workflow=readFileSync(resolve(process.cwd(),'.github/workflows/ci.yml'),'utf8')
const job=(name:string)=>{
 const start=workflow.indexOf('\n  '+name+':\n')
 if(start<0)throw Error('Missing CI job: '+name)
 const rest=workflow.slice(start+1)
 const end=rest.slice(1).search(/\n  [\w-]+:\n/)
 return end<0?rest:rest.slice(0,end+1)
}

describe('FIX #573 full-suite CI sharding contract',()=>{
 it('keeps the original npm and SQL gates',()=>{
  expect(job('check')).toContain('npm run check')
  expect(job('mcp-sql')).toContain('node tests/mcp/st5.mjs')
  expect(job('mcp-sql')).toContain('node tests/mcp/db5.mjs')
 })
 it('runs all Playwright tests once in four independent shards',()=>{
  const e2e=job('e2e')
  expect(e2e).toContain('shard: [1, 2, 3, 4]')
  expect(e2e).toContain('fail-fast: false')
  expect(e2e).toContain('npm run e2e -- --shard=${{ matrix.shard }}/4 --pass-with-no-tests')
  expect(e2e).toContain('node scripts/v7/install-chromium.mjs')
  // The wrapper retains Playwright host validation and its pinned browser.
  const installer=readFileSync(resolve(process.cwd(),'scripts/v7/install-chromium.mjs'),'utf8')
  expect(installer).toContain("run(['playwright','install','--with-deps','chromium'],180_000)")
  expect(installer).toContain("run(['playwright','install-deps','chromium'])")
  expect(installer).toContain("join(packageRoot,'browsers.json')")
  expect(installer).toContain('storage.googleapis.com/chrome-for-testing-public/${descriptor.browserVersion}')
  expect(installer).toContain("throw Error('Downloaded Chromium version does not match the lockfile')")
  expect(installer).toContain("throw Error('Playwright browser installation is incomplete')")
  expect(e2e).not.toMatch(/--grep(?:-invert)?\b|--ignore-snapshots|--only-changed|--max-failures/)
 })
 it('fails closed if any shard is absent and validates all screenshot envelopes',()=>{
  const e2e=job('e2e')
  const qa=job('qa3-screens')
  expect(e2e).toContain('name: screens-shard-${{ matrix.shard }}')
  expect(e2e).toContain('if-no-files-found: error')
  expect(qa).toContain('needs: e2e')
  expect(qa).toContain('pattern: screens-shard-*')
  expect(qa).toContain('merge-multiple: true')
  expect(qa).toContain('npx tsx scripts/qa3-screens.ts')
  expect(qa).toContain('name: screens')
  expect(qa).not.toMatch(/^    if:\s*always\(\)/m)
 })
})
