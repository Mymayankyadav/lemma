// Read an owner export. Applying the preview uses the ordinary authenticated command RPCs.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

function operationId(parts) {
  const h=createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return [h.slice(0,8),h.slice(8,12),'5'+h.slice(13,16),'8'+h.slice(17,20),h.slice(20,32)].join('-');
}
export function r0Import(tables,sittingId,tag) {
  const sitting=tables.exam_sittings?.find(s=>s.id===sittingId);
  const project=tables.projects?.find(p=>p.id===sitting?.project_id&&p.user_id===sitting.user_id);
  if(!project||!tag)throw Error('Choose a sitting and its exact R0 tag from the owner export.');
  const owner=sitting.user_id, rows=new Set(sitting.blueprint.map(r=>r.key));
  const sessions=new Set((tables.sessions??[]).filter(s=>s.user_id===owner&&s.project_id===project.id).map(s=>s.id));
  const groups=[];
  const command=(resource,operation,source,patch,extra={})=>({schemaVersion:1,resource,operation,
    operationId:operationId(['exam-r0',owner,sitting.id,resource,operation,String(source)]),patch,...extra});
  for(const e of tables.session_events??[]) {
    if(e.user_id!==owner||!sessions.has(e.session_id)||e.voided_at||!['pretest','attempt'].includes(e.kind))continue;
    const m=/^EXAM\s+(\S+)\s+ROW\s+([a-z0-9_-]+)\s+MARKS\s+(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s+(\d+)s\s+(IND|HINT|RECAP)\s*$/i.exec(e.body??'');
    const outcome={demonstrated:'correct',partial:'partial',failed:'incorrect'}[e.outcome];
    if(!m||m[1]!==tag||!rows.has(m[2])||!outcome||!e.id||!Number.isFinite(Date.parse(e.occurred_at??e.created_at)))continue;
    const earned=Number(m[3]),possible=Number(m[4]),seconds=Number(m[5]);
    if(possible<=0||possible>1000||earned>possible||seconds>36000)continue;
    const mark=m[6].toUpperCase();
    groups.push([command('exam_attempts','record',e.id,{sitting_id:sitting.id,row_key:m[2],kind:e.kind==='pretest'?'probe':'practice',
      delivery:'chat',delivery_ref:'r0:'+e.id,outcome,marks_awarded:earned,marks_possible:possible,seconds,timed:true,
      independence:{IND:'independent',HINT:'hinted',RECAP:'after_recap'}[mark],hint_level:mark==='HINT'?Math.max(1,e.hint_level??1):0,
      session_id:e.session_id,occurred_at:e.occurred_at??e.created_at})]);
  }
  for(const thought of tables.parked_thoughts??[]) {
    if(thought.user_id!==owner||!thought.id||thought.status!=='open'||!Number.isInteger(thought.version))continue;
    const m=/^CARD IDEA\s+([^ :·]+)(?:\s*·\s*([^:]+))?\s*:\s*([^|]+)\|\s*(?:why\s*:\s*)?([^|]+)\|\s*(?:evidence\s*:\s*)?(.+)$/i.exec(thought.text??'');
    if(!m||m[1]!==project.slug)continue;
    const patch={project_id:project.id,sitting_id:sitting.id,target:m[3].trim(),reason:m[4].trim(),
      evidence:[{thought:thought.id,note:m[5].trim().slice(0,220)}]};
    groups.push([command('card_ideas','save',thought.id,patch),
      command('parked_thoughts','dismiss',thought.id,{}, {target:{id:thought.id},expectedVersion:thought.version})]);
  }
  return groups;
}
export async function applyR0(groups,send) {
  const receipts=[];
  for(const group of groups)for(const command of group) {
    const receipt=await send(command);
    if(receipt?.operationId!==command.operationId||!['ok','duplicate','unchanged'].includes(receipt.status))
      throw Error('Import paused at '+command.operationId+' ('+(receipt?.status??'unknown receipt')+'). Retry the same preview.');
    receipts.push(receipt);
  }
  return receipts;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [file,sitting,tag,action]=process.argv.slice(2);
  if(!file||!sitting||!tag||action&&action!=='--apply')throw Error('Usage: node scripts/exam/import-r0.mjs owner-export.json SITTING TAG [--apply]');
  const data=JSON.parse(await readFile(file,'utf8'));
  const groups=r0Import(data.tables??data.snapshot??data,sitting,tag);
  if(!action)process.stdout.write(JSON.stringify(groups,null,2)+'\n');
  else {
    const endpoint=new URL(process.env.LEMMA_SUPABASE_URL);
    if(endpoint.protocol!=='https:'||!process.env.LEMMA_ACCESS_TOKEN||!process.env.LEMMA_ANON_KEY)throw Error('Set the HTTPS Supabase URL, public key and owner access token.');
    const rpc={exam_attempts:'exam_attempt_command',card_ideas:'card_idea_command',parked_thoughts:'parked_thoughts_command'};
    const receipts=await applyR0(groups,async cmd=>{
      const response=await fetch(new URL('/rest/v1/rpc/'+rpc[cmd.resource],endpoint),{method:'POST',redirect:'error',
        headers:{'Content-Type':'application/json',apikey:process.env.LEMMA_ANON_KEY,Authorization:'Bearer '+process.env.LEMMA_ACCESS_TOKEN},
        body:JSON.stringify({p:cmd})});
      if(!response.ok)throw Error('Command '+cmd.operationId+' returned HTTP '+response.status);
      return response.json();
    });
    console.log('Confirmed '+receipts.length+' command receipts.');
  }
}
