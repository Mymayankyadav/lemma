import {describe,it,expect} from 'vitest'
import {pageRange,validPdfPageIndex} from '../../../supabase/functions/mcp/text'

describe('MCP read_pages numeric PDF indexes',()=>{
 it('accepts positive decimal page numbers',()=>{
  for(const page of ['1','2','42','0001','999'])expect(validPdfPageIndex(page),page).toBe(true)
 })
 it('rejects roman labels, zero, negatives, fractions and escaped-digit text',()=>{
  for(const page of ['0','-1','iv','i','1.5','1a','\\d',''])expect(validPdfPageIndex(page),page).toBe(false)
 })
 it('expands bounded numeric ranges and leaves roman source labels to non-PDF mode',()=>{
  expect(pageRange('1','3')).toEqual(['1','2','3'])
  expect(pageRange('iv')).toEqual(['iv'])
  expect(()=>pageRange('1','7')).toThrow(/at most 5/)
 })
})
