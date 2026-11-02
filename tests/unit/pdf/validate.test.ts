import {describe,expect,it} from 'vitest';
import {isPdfFile,isSourceFile,textKind} from '../../../src/pdf/validate';

const file=(name:string,type='')=>({name,type});

describe('FIX #659 lightweight source validation',()=>{
 it('accepts real PDF MIME and generic binary .pdf files',()=>{
  expect(isPdfFile(file('a.txt','application/pdf'))).toBe(true);
  expect(isPdfFile(file('notes.PDF','application/octet-stream'))).toBe(true);
  expect(isPdfFile(file('notes.pdf','binary/octet-stream'))).toBe(true);
  expect(isPdfFile(file('notes.pdf',''))).toBe(true);
  expect(isPdfFile(file('notes.txt','application/octet-stream'))).toBe(false);
  expect(isPdfFile(file('notes.pdf','image/png'))).toBe(false);
 });
 it('accepts tex and markdown by supported extensions or MIME without broadening file types',()=>{
  for(const name of ['a.tex','a.latex','a.ltx','a.md','a.markdown']){
   expect(isSourceFile(file(name))).toBe(true);
  }
  expect(textKind(file('proof.txt','application/x-tex'))).toBe('tex');
  expect(textKind(file('notes.txt','text/markdown'))).toBe('md');
  expect(isSourceFile(file('notes.txt','text/plain'))).toBe(false);
  expect(isSourceFile(file('image.png','image/png'))).toBe(false);
 });
 it('uses the same parser precedence for MIME and extension',()=>{
  expect(textKind(file('proof.md','application/x-tex'))).toBe('tex');
  expect(textKind(file('proof.tex','text/markdown'))).toBe('tex');
  expect(isSourceFile(file('draft.PDF','application/octet-stream'))).toBe(true);
 });
});
