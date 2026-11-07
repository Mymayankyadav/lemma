import {describe,expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {queueDecision,parseQueueTicket,releaseQueueTicket} from '../../../scripts/mcp-selftest-queue-policy.mjs';

// FIX #636: GitHub Actions concurrency keeps one running and only one pending;
// a third trigger replaces the older pending run. All three must instead get
// durable FIFO tickets and run their original mutating selftests.
const start=(id:number,run:number,attempt=1)=>({id,user:{login:'github-actions[bot]'},body:`LEMMA-MCP-QUEUE v1 START ${run}/${attempt}`});
const done=(id:number,run:number,attempt=1)=>({id,user:{login:'github-actions[bot]'},body:`LEMMA-MCP-QUEUE v1 DONE ${run}/${attempt}`});

describe('FIX #636 durable MCP selftest queue',()=>{
 it('parses the operational Node script and checks exact run-attempt status',()=>{
  const result=spawnSync(process.execPath,['--check','scripts/mcp-selftest-queue.mjs'],{encoding:'utf8'});
  expect(result.status,result.stderr).toBe(0);
  const source=readFileSync('scripts/mcp-selftest-queue.mjs','utf8');
  expect(source).toContain('/actions/runs/${ticket.runId}/attempts/${ticket.attempt}');
  expect(source).toContain('MCP queue wait exceeded 55 minutes');
  expect(source).not.toContain('MCP_URL');
 });
 it('accepts only well-formed public run-attempt tickets',()=>{
  expect(parseQueueTicket(start(10,100))).toEqual({id:10,kind:'START',key:'100/1',runId:100,attempt:1});
  expect(parseQueueTicket({id:12,body:'MCP_URL=secret'})).toBeNull();
  expect(parseQueueTicket({id:13,user:{login:'github-actions[bot]'},body:'LEMMA-MCP-QUEUE v1 START 0/1'})).toBeNull();
  // The queue issue is public. Arbitrary commenters must never inject a
  // fake predecessor that blocks all future deployments.
  expect(parseQueueTicket({id:14,user:{login:'untrusted-user'},body:'LEMMA-MCP-QUEUE v1 START 999/1'})).toBeNull();
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
 it('does not wait on a duplicate START ticket from the same run attempt',()=>{
  const tickets=[start(15,150),start(16,150),start(17,151)];
  expect(queueDecision(tickets,16,{})).toEqual({canRun:true,waitingOn:[]});
  expect(queueDecision(tickets,17,{'150/1':'in_progress'}))
   .toEqual({canRun:false,waitingOn:['150/1']});
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
 
 it('retries a transient DONE POST, re-reads its receipt and never duplicates release',async()=>{
  const entries=[start(100,1000)];
  let posts=0;
  let sleeps=0;
  const status=await releaseQueueTicket({
   key:'1000/1',listComments:async()=>entries,
   markDone:async()=>{
    posts++;
    entries.push(done(101,1000));
    throw new Error('transient response failure after GitHub accepted DONE');
   },
   sleep:async()=>{sleeps++},attempts:3,
  });
  expect(status).toBe('already-done');
  expect(posts).toBe(1);
  expect(sleeps).toBe(1);
 });
 it('recovers a transient GitHub GET failure before safely releasing the ticket',async()=>{
  let reads=0,posts=0;
  const status=await releaseQueueTicket({
   key:'1001/1',listComments:async()=>{if(++reads===1)throw new Error('HTTP 502');return [start(102,1001)]},
   markDone:async()=>{posts++},sleep:async()=>{},attempts:3,
  });
  expect(status).toBe('posted');
  expect(reads).toBe(2);
  expect(posts).toBe(1);
 });
 it('fails closed after a bounded set of unavailable GitHub API responses',async()=>{
  let calls=0,delays=0;
  await expect(releaseQueueTicket({
   key:'1002/1',listComments:async()=>{calls++;throw new Error('HTTP 503')},
   markDone:async()=>{throw new Error('must not post')},
   sleep:async()=>{delays++},attempts:3,
  })).rejects.toThrow('HTTP 503');
  expect(calls).toBe(3);
  expect(delays).toBe(2);
 });
 it('does not post when START is absent or DONE already exists',async()=>{
  let posts=0;
  const make=(entries:unknown[])=>releaseQueueTicket({
   key:'1003/1',listComments:async()=>entries,
   markDone:async()=>{posts++},sleep:async()=>{},attempts:2,
  });
  expect(await make([])).toBe('no-start');
  expect(await make([start(103,1003),done(104,1003)])).toBe('already-done');
  expect(posts).toBe(0);
 });
 it('fails closed when the current ticket is missing or malformed',()=>{
  expect(()=>queueDecision([start(40,400)],41,{})).toThrow(/ticket/i);
 });
});
