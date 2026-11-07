// Pure, regression-tested FIFO decision logic for mutating MCP selftests.
// Ticket IDs are GitHub issue-comment IDs: REST creation totally orders starts.
const pattern=/^LEMMA-MCP-QUEUE v1 (START|DONE) ([1-9]\d*)\/([1-9]\d*)$/;
export function parseQueueTicket(comment){
 const match=pattern.exec(String(comment.body??'').trim());
 if(!match||comment.user?.login!=='github-actions[bot]'||
    !Number.isSafeInteger(comment.id)||comment.id<=0)return null;
 const runId=Number(match[2]),attempt=Number(match[3]);
 if(!Number.isSafeInteger(runId)||!Number.isSafeInteger(attempt))return null;
 return {id:comment.id,kind:match[1],key:`${runId}/${attempt}`,runId,attempt};
}
export function queueDecision(comments,ticketId,attemptStatuses){
 const tickets=comments.map(parseQueueTicket).filter(Boolean).sort((a,b)=>a.id-b.id);
 const own=tickets.find(ticket=>ticket.id===ticketId&&ticket.kind==='START');
 if(!own)throw new Error('MCP queue START ticket not visible; fail closed');
 const finished=new Set(tickets.filter(ticket=>ticket.kind==='DONE').map(ticket=>ticket.key));
 const waitingOn=[];
 const seen=new Set();
 for(const ticket of tickets){
  if(ticket.id>=own.id)break;
  if(ticket.kind!=='START'||ticket.key===own.key||seen.has(ticket.key))continue;
  seen.add(ticket.key);
  if(!finished.has(ticket.key)&&attemptStatuses[ticket.key]!=='completed')
   waitingOn.push(ticket.key);
 }
 return {canRun:waitingOn.length===0,waitingOn};
}

/**
 * Close the deployment ticket even if GitHub transiently fails a read or a
 * DONE POST. Every retry re-reads the queue: a committed-but-unacknowledged
 * POST is detected and never posts a duplicate DONE. Exhaustion fails closed.
 */
export async function releaseQueueTicket({
 key,listComments,markDone,sleep,attempts=8,
}){
 if(!/^[1-9]\d*\/[1-9]\d*$/.test(String(key)) ||
   !Number.isSafeInteger(attempts) || attempts<1 || attempts>12)
   throw new Error('Invalid MCP queue release context');
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const entries=await listComments();
   if(!Array.isArray(entries))throw new Error('MCP queue comments response invalid');
   const tickets=entries.map(parseQueueTicket).filter(Boolean);
   if(!tickets.some(t=>t.kind==='START'&&t.key===key))return 'no-start';
   if(tickets.some(t=>t.kind==='DONE'&&t.key===key))return 'already-done';
   await markDone();
   return 'posted';
  }catch(error){
   if(attempt===attempts-1)throw error;
   await sleep(Math.min(2000*(attempt+1),15000));
  }
 }
}
