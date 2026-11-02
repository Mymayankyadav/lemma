// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import * as ts from 'typescript'

// Execute the actual bootstrap after compiling its TSX, with the App chunk
// deliberately unavailable. Source-only checks cannot catch a blank #root.
const source=readFileSync('src/main.tsx','utf8')
const script=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,
}}).outputText

function runBootstrap(failApp:boolean){
 const render=vi.fn(),reload=vi.fn()
 const root=document.getElementById('root')!
 const requireModule=(id:string)=>{
  if(id==='react')return {StrictMode:'StrictMode'}
  if(id==='react-dom/client')return {createRoot:()=>({render})}
  if(id==='react/jsx-runtime')return {jsx:()=>({})}
  if(id==='./styles/app.css')return {}
  if(id==='./app/App'){
   if(failApp)throw new Error('App chunk unavailable')
   return {default:()=>null}
  }
  throw new Error('Unexpected bootstrap dependency: '+id)
 }
 runInNewContext(script,{exports:{},require:requireModule,document,
  window:{location:{hash:'#/atlas',reload}},Promise,console},{timeout:1000})
 return {root,render,reload}
}

describe('FIX-651b async App bootstrap failure recovery',()=>{
 beforeEach(()=>{document.body.innerHTML='<div id="root"></div>'})
 it('shows an accessible retry instead of a blank root when the App chunk rejects',async()=>{
  const h=runBootstrap(true)
  await vi.waitFor(()=>expect(h.root.querySelector('[role="alert"]')).not.toBeNull())
  expect(h.root.textContent).toContain('Could not load Lemma')
  expect(h.root.textContent).toContain('Check your connection')
  const retry=h.root.querySelector('button')
  expect(retry?.textContent).toContain('Try again')
  retry?.click()
  expect(h.reload).toHaveBeenCalledOnce()
  expect(h.render).not.toHaveBeenCalled()
 })
 it('still mounts the original App without a recovery screen when the chunk loads',async()=>{
  const h=runBootstrap(false)
  await vi.waitFor(()=>expect(h.render).toHaveBeenCalledOnce())
  expect(h.root.querySelector('[role="alert"]')).toBeNull()
 })
 it('handles failures from both route-exclusive HTML prefetches',()=>{
  const html=readFileSync('index.html','utf8')
  const preload=html.match(/<script type="module" data-review-run-preload>([\s\S]*?)<\/script>/)?.[1]??''
  expect(preload).toMatch(/import\(['"]\/src\/features\/review-run\/Page\.tsx['"]\)\.catch\(/)
  expect(preload).toMatch(/import\(['"]\/src\/app\/App\.tsx['"]\)\.catch\(/)
 })
})
