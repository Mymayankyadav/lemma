// @vitest-environment node
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {canRenderPlainHomeTex} from '../../../src/features/home/FastHomeTex'

describe('FIX #507 cold Today text rendering',()=>{
 it('uses escaped React text only when there is no Markdown, HTML or LaTeX',()=>{
  expect(canRenderPlainHomeTex('Checkpoint 4: a proof with precise hypotheses')).toBe(true)
  expect(canRenderPlainHomeTex('Mathematics project 60')).toBe(true)
  for(const value of ['', '$x^2$', String.raw`\\(x\\)`, '**bold**', '[link](url)',
   '<b>html</b>', 'A &amp; B', 'line\\nbreak', 'code \`x\`'])
   expect(canRenderPlainHomeTex(value)).toBe(false)
 })
 it('keeps the rich renderer out of the initial Home and goal modules',()=>{
  const page=readFileSync('src/features/home/Page.tsx','utf8')
  const goals=readFileSync('src/features/home/GoalDistance.tsx','utf8')
  for(const file of [page,goals]){
   expect(file).not.toMatch(/import\s*\{\s*Tex\s*\}\s*from\s*['"]\.\.\/\.\.\/ui\/Tex['"]/)
   expect(file).toContain('FastHomeTex')
  }
 })
})
