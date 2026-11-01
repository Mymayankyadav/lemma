import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const source=readFileSync(resolve(process.cwd(),'src/main.tsx'),'utf8')

describe('FIX-651b Review-run early bootstrap ordering',()=>{
 it('does not wait for the static App graph before requesting the Review-run chunk',()=>{
  expect(source).not.toMatch(/^\s*import\s+App\s+from\s+['"]\.\/app\/App['"]/m)
  const review=source.indexOf("import('./features/review-run/Page')")
  const app=source.indexOf("import('./app/App')")
  expect(review).toBeGreaterThan(0)
  expect(app).toBeGreaterThan(review)
 })
 it('starts the early route request only for the exact Review-run hash',()=>{
  expect(source).toMatch(/const\s+hash\s*=\s*window\.location\.hash\.split\(['"]\?['"]\)\[0\]/)
  expect(source).toMatch(/if\s*\([^)]*#\/review\/run[^)]*\)\s*\{/)
 })
 it('renders the same StrictMode App root after its asynchronous import',()=>{
  expect(source).toContain("createRoot(document.getElementById('root')!)")
  expect(source).toMatch(/import\(['"]\.\/app\/App['"]\)\.then\(/)
  expect(source).toContain('<StrictMode><App /></StrictMode>')
 })
})
