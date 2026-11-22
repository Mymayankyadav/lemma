import React,{act,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {TimeField,parseClock} from '../../../src/ui/v7/TimeField';

// N220 (Owner report): time blocks take typed times instead of full-day rulers that opened the keyboard on the title.
describe('parseClock',()=>{
 it('reads the usual ways of typing a time of day',()=>{
  expect(parseClock('930')).toBe('09:30');
  expect(parseClock('0930')).toBe('09:30');
  expect(parseClock('9:30')).toBe('09:30');
  expect(parseClock('09.30')).toBe('09:30');
  expect(parseClock(' 7:05 ')).toBe('07:05');
  expect(parseClock('23:59')).toBe('23:59');
 });
 it('rejects what is not a time of day',()=>{
  for(const text of ['','ab','24:00','12:60','7:5','12345'])expect(parseClock(text),text).toBeNull();
 });
});

describe('TimeField',()=>{
 let host:HTMLDivElement,root:Root;
 beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
 afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
 const type=(input:HTMLInputElement,value:string)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 it('applies four digits at once, completes a short time when left and returns to the last good time when invalid',async()=>{
  const changes:string[]=[];
  function Harness(){
   const [value,setValue]=useState('09:00');
   return <TimeField label="Start" value={value} onChange={next=>{changes.push(next);setValue(next);}}/>;
  }
  await act(async()=>root.render(<Harness/>));
  const input=host.querySelector('input')!;
  expect(input.type).toBe('text');
  expect(input.getAttribute('inputmode')).toBe('numeric');
  expect(host.querySelector('label')?.htmlFor).toBe(input.id);
  expect(input.value).toBe('09:00');
  await act(async()=>input.focus());
  await type(input,'1430');
  expect(changes).toEqual(['14:30']);
  await act(async()=>input.blur());
  expect(input.value).toBe('14:30');
  await act(async()=>input.focus());
  await type(input,'745');
  expect(changes).toEqual(['14:30']);
  await act(async()=>input.blur());
  expect(input.value).toBe('07:45');
  expect(changes).toEqual(['14:30','07:45']);
  await act(async()=>input.focus());
  await type(input,'99');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  await act(async()=>input.blur());
  expect(input.value).toBe('07:45');
  expect(input.getAttribute('aria-invalid')).toBeNull();
  expect(changes).toEqual(['14:30','07:45']);
 });
});
