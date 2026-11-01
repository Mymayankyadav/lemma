import {describe,expect,it} from 'vitest';
import {queueDecision,parseQueueTicket} from '../../../scripts/mcp-selftest-queue-policy.mjs';

// FIX #636: GitHub Actions concurrency keeps one running and only one pending;
// a third trigger replaces the older pending run. All three must instead get
// durable FIFO tickets and run their original mutating selftests.
const start=(id:number,run:number,attempt=1)=>({id,body:`LEMMA-MCP-QUEUE v1 START ${run}/${attempt}`});
const done=(id:number,run:number,attempt=1)=>({id,body:`LEMMA-MCP-QUEUE v1 DONE ${run}/${attempt}`});

describe('FIX #636 durable MCP selftest queue',()=>{
 it('accepts only well-formed public run-attempt tickets',()=>{
  expect(parseQueueTicket(start(10,100))).toEqual({id:10,kind:'START',key:'100/1',runId:100,attempt:1});
  expect(parseQueueTicket({id:12,body:'MCP_URL=secret'})).toBeNull();
  expect(parseQueueTicket({id:13,body:'LEMMA-MCP-QUEUE v1 START 0/1'})).toBeNull();
 });
 it('never loses the middle run when three workflows trigger while one runs',()=>{
  const tickets=[start(10,100),start(11,101),start(12,102)];
  expect(queueDecision(tickets,10,{})).toEqual({canRun:true,waitingOn:[]});
  expect(queueDecision(tickets,11,{'100/1':'in_progress'})).toEqual({canRun:false,waitingOn:['100/1']});
  expect(queueDecision(tickets,12,{'100/1':'in_progress','101/1':'queued'}))
   .toEqual({canRun:false,waitingOn:['100/1','101/1']});
  tickets.push(done(13,100));
  expect(queueDecision(tickets,11,{})).toEqual({canRun:true,waitingOn:[]});
  expect(queueDecision(tickets,12,{'101/1':'in_progress'}))
   .toEqual({canRun:false,waitingOn:['101/1']});
  tickets.push(done(14,101));
  expect(queueDecision(tickets,12,{})).toEqual({canRun:true,waitingOn:[]});
 });
 it('recovers cancelled attempts but never reports their smoke as passed',()=>{
  const tickets=[start(20,200),start(21,201)];
  expect(queueDecision(tickets,21,{'200/1':'completed'}))
   .toEqual({canRun:true,waitingOn:[]});
  expect(queueDecision(tickets,21,{})).toEqual({canRun:false,waitingOn:['200/1']});
 });
 it('distinguishes rerun attempts of the same workflow run',()=>{
  const tickets=[start(30,300,1),start(31,300,2)];
  expect(queueDecision(tickets,31,{'300/1':'completed'}))
   .toEqual({canRun:true,waitingOn:[]});
  expect(queueDecision(tickets,31,{'300/1':'in_progress'}))
   .toEqual({canRun:false,waitingOn:['300/1']});
 });
 it('fails closed when the current ticket is missing or malformed',()=>{
  expect(()=>queueDecision([start(40,400)],41,{})).toThrow(/ticket/i);
 });
});
