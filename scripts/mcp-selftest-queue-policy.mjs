// Pure, regression-tested FIFO decision logic for mutating MCP selftests.
// Ticket IDs are GitHub issue-comment IDs: REST creation totally orders starts.
const pattern=/^LEMMA-MCP-QUEUE v1 (START|DONE) ([1-9]\d*)\/([1-9]\d*)$/;
export function parseQueueTicket(comment){
 const match=pattern.exec(String(comment.body??'').trim());
 if(!match||!Number.isSafeInteger(comment.id)||comment.id<=0)return null;
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
  if(ticket.kind!=='START'||seen.has(ticket.key))continue;
  seen.add(ticket.key);
  if(!finished.has(ticket.key)&&attemptStatuses[ticket.key]!=='completed')
   waitingOn.push(ticket.key);
 }
 return {canRun:waitingOn.length===0,waitingOn};
}
