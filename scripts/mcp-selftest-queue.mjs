// Durable FIFO lock for two GitHub Actions workflows that mutate the same
// MCP selftest fixture. Never print tokens, connector URLs or response bodies.
// GitHub Actions 'concurrency' is NOT a FIFO queue: a third pending trigger
// cancels the second one, even with cancel-in-progress: false.
import {parseQueueTicket,queueDecision} from './mcp-selftest-queue-policy.mjs';

const action=process.argv[2];
const repository=process.env.GITHUB_REPOSITORY??'';
const token=process.env.GITHUB_TOKEN??'';
const runId=Number(process.env.GITHUB_RUN_ID);
const attempt=Number(process.env.GITHUB_RUN_ATTEMPT??'1');
const issue=668; // Machine-managed FIFO comments, not an owner-facing log.
if(!['acquire','release'].includes(action)||!token||
 !/^[\w.-]+\/[\w.-]+$/.test(repository)||
 !Number.isSafeInteger(runId)||runId<=0||
 !Number.isSafeInteger(attempt)||attempt<=0)
 throw new Error('MCP queue requires a valid action and GitHub Actions run context');
const key=`${runId}/${attempt}`;
const prefix=`/repos/${repository}`;
const marker=kind=>`LEMMA-MCP-QUEUE v1 ${kind} ${key}`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function api(path,method='GET',payload){
 const response=await fetch('https://api.github.com'+path,{
  method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28',
   ...(payload?{'Content-Type':'application/json'}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{}),
 });
 if(!response.ok)throw new Error(`MCP queue REST ${method} failed with HTTP ${response.status}; fail closed`);
 return response.json();
}

async function comments(){
 // A GitHub Actions job cannot run for twelve hours; older tickets are stale.
 // GitHub's 'since' filter is on update time, so DONE comments remain visible.
 const since=encodeURIComponent(new Date(Date.now()-12*60*60*1000).toISOString());
 const all=[];
 for(let page=1;page<=50;page++){
  const batch=await api(`${prefix}/issues/${issue}/comments?per_page=100&page=${page}&since=${since}`);
  if(!Array.isArray(batch))throw new Error('MCP queue comments response invalid');
  all.push(...batch);
  if(batch.length<100)return all;
 }
 throw new Error('MCP queue comments exceed 5000 in twelve hours; fail closed');
}
async function post(kind){
 const comment=await api(`${prefix}/issues/${issue}/comments`,'POST',{body:marker(kind)});
 if(!Number.isSafeInteger(comment.id))throw new Error('MCP queue ticket missing ID');
 return comment;
}
async function attemptStatus(ticket){
 const run=await api(`${prefix}/actions/runs/${ticket.runId}/attempts/${ticket.attempt}`);
 if(!['queued','in_progress','waiting','pending','requested','completed'].includes(run.status))
  throw new Error('MCP queue attempt status unavailable; fail closed');
 return run.status;
}

async function acquire(){
 let entries=await comments();
 const existing=entries.map(parseQueueTicket).find(ticket=>ticket?.kind==='START'&&ticket.key===key);
 const ticketId=existing?.id??(await post('START')).id;
 const deadline=Date.now()+55*60*1000;
 for(;;){
  entries=await comments();
  const parsed=entries.map(parseQueueTicket).filter(Boolean);
  const earlier=parsed.filter(ticket=>ticket.kind==='START'&&ticket.id<ticketId);
  const statuses={};
  // A completed or cancelled workflow attempt cannot still hold the fixture.
  // The earlier job's conclusion remains failed/cancelled in Actions; this
  // queue never reports that attempt as a successful selftest.
  for(const ticket of earlier){
   if(parsed.some(other=>other.kind==='DONE'&&other.key===ticket.key))continue;
   if(statuses[ticket.key]===undefined)statuses[ticket.key]=await attemptStatus(ticket);
  }
  const decision=queueDecision(entries,ticketId,statuses);
  if(decision.canRun){
   console.log(`MCP selftest queue acquired: run ${key}, ticket ${ticketId}`);
   return;
  }
  if(Date.now()>deadline)throw new Error('MCP queue wait exceeded 55 minutes; no selftest skipped');
  console.log(`MCP selftest queued: ${decision.waitingOn.length} earlier live attempt(s)`);
  await sleep(10_000);
 }
}
async function release(){
 const entries=await comments();
 const parsed=entries.map(parseQueueTicket).filter(Boolean);
 if(!parsed.some(ticket=>ticket.kind==='START'&&ticket.key===key))return;
 if(parsed.some(ticket=>ticket.kind==='DONE'&&ticket.key===key))return;
 await post('DONE');
 console.log(`MCP selftest queue released: run ${key}`);
}
await (action==='acquire'?acquire():release());
