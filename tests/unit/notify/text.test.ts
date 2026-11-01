import { describe, expect, it } from 'vitest'
import { plainMath } from '../../../src/lib/plain-math'
import { notifyText, notifyTitle, notifyBody } from '../../../supabase/functions/_shared/notify-text'

describe('safe notification copy',()=>{
 it('renders the four specified math examples without exposing raw TeX',()=>{
  expect(notifyText('Why is $\\mathbb R$ not compact?')).toBe('Why is ℝ not compact?')
  expect(notifyText('$x^2 \\to 0$')).toBe('x² → 0')
  expect(notifyText('$\\int_0^1 f \\,dx$')).toBe('…')
  expect(notifyText('$$\\sum_{k=1}^n k$$')).toBe('…')
 })
 it('keeps a 30-case copy of plainMath in parity for supported labels',()=>{
  const samples=[
   '\\mathbb R','\\mathbb{N}','\\mathbb Z','\\mathbb{Q}','\\mathbb C',
   '\\alpha','\\beta','\\gamma','\\delta','\\epsilon','\\theta','\\lambda','\\mu',
   '\\pi','\\sigma','\\tau','\\phi','\\varphi','\\Gamma','\\Delta',
   '\\to','\\rightarrow','\\in','\\subseteq','\\cup','\\cap',
   'x^2','x_{12}','\\frac{a}{b}','\\mathrm{span}',
  ]
  expect(samples).toHaveLength(30)
  for(const sample of samples)expect(notifyText(sample)).toBe(plainMath(sample))
 })
 it('clamps titles and bodies at word boundaries with an ellipsis',()=>{
  const title='A long mathematical project title that continues beyond the notification limit'
  expect(notifyTitle(title).length).toBeLessThanOrEqual(48)
  expect(notifyTitle(title)).toMatch(/…$/)
  expect(notifyTitle(title).slice(0,-1)).not.toMatch(/ $/)
  expect(notifyBody('one '.repeat(100)).length).toBeLessThanOrEqual(140)
  expect(notifyText('short')).toBe('short')
 })
 it('never leaks dollar delimiters or backslashes for 500 deterministic random TeX strings',()=>{
  let seed=1234567
  const tokens=['$','\\','\\int','\\alpha','\\unknown','{','}','x^2','$$','\\mathbb R','text',' ','\\sum']
  for(let i=0;i<500;i++){
   let source=''
   for(let j=0;j<12;j++){
    seed=(seed*1664525+1013904223)>>>0
    source+=tokens[seed%tokens.length]
   }
   expect(notifyText(source)).not.toMatch(/[\\$]/)
  }
 })
})
