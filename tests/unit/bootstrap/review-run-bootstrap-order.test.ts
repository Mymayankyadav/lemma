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
 it('preloads the App graph on non-Review routes without fetching Review-run code',()=>{
  const html=readFileSync(resolve(process.cwd(),'index.html'),'utf8')
  const preload=html.match(/<script type="module" data-review-run-preload>([\s\S]*?)<\/script>/)?.[1]??''
  expect(preload).toContain("if (location.hash.split('?')[0] === '#/review/run')")
  expect(preload).toMatch(/import\(['"]\/src\/features\/review-run\/Page\.tsx['"]\)/)
  expect(preload).toMatch(/}\s*else\s*{\s*void\s+import\(['"]\/src\/app\/App\.tsx['"]\)/)
 })
 it('renders the same StrictMode App root after its asynchronous import',()=>{
  expect(source).toContain("createRoot(document.getElementById('root')!)")
  expect(source).toMatch(/import\(['"]\.\/app\/App['"]\)\.then\(/)
  expect(source).toContain('<StrictMode><App /></StrictMode>')
 })
})
