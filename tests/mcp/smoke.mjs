// Node 22; no dependencies. Set MCP_URL in the environment; do not print it.
import assert from 'node:assert/strict';
import { formatSelftestHttpFailure } from './smoke-diagnostics.mjs';
const url=process.env.MCP_URL;
if(!url)throw Error('MCP_URL environment variable is required');
const names=['resume','get','read_pages','search','save_pages','start_session','save_progress','end_session','propose_cards','propose_card_edits','propose_plan','propose_plan_change','create_project','proposals','decide','set_prompt','history','undo','edit','add','delete','review','grade'];
const readTools=new Set(['resume','get','read_pages','search','proposals','history','review']);
let seq=0;
let sessionId;
const headers=()=>({
  'Content-Type':'application/json',
  'Accept':'application/json, text/event-stream',
  ...(sessionId?{'Mcp-Session-Id':sessionId}:{})
});
async function call(method,params={}){
  const id=++seq;
  const res=await fetch(url,{method:'POST',headers:headers(),body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  assert.equal(res.ok,true,method+' returned HTTP '+res.status);
  sessionId ||= res.headers.get('Mcp-Session-Id')||undefined;
  const body=await res.text();
  const messages=res.headers.get('Content-Type')?.includes('text/event-stream')
    ?body.split(/\r?\n/).filter(line=>line.startsWith('data:'))
       .map(line=>JSON.parse(line.slice(5).trim()))
    :[JSON.parse(body)];
  const record=messages.find(x=>x.id===id);
  assert.ok(record,method+' response missing');
  assert.equal(record.error,undefined,method+' error: '+record.error?.message);
  return record.result;
}
// The self-test runs in three independent partitions. The Edge worker can
// terminate a long request before 150s, so keep each partition comfortably bounded.
for(const part of [1,2,3]){
  const started=Date.now();
  let res;
  try {
    res=await fetch(url+'/selftest?part='+part,{signal:AbortSignal.timeout(140_000)});
  } catch(error) {
    const kind=error instanceof Error&&error.name==='TimeoutError'?'timeout':'network error';
    console.error('FAIL selftest part '+part+' request ('+kind+') after '+(Date.now()-started)+'ms');
    throw new Error('MCP selftest request failed (endpoint redacted)');
  }
  // A gateway can return HTML/plain text or a generic 503 with no steps.
  // Keep diagnostic output strictly to status, MIME class and elapsed time:
  // the URL contains the connector secret and response bodies may contain data.
  const diagnostic=()=>formatSelftestHttpFailure({
    part,status:res.status,contentType:res.headers.get('Content-Type'),
    elapsedMs:Date.now()-started,
  });
  let self;
  try {
    self=await res.json();
  } catch {
    throw new Error(formatSelftestHttpFailure({
      part,status:res.status,contentType:res.headers.get('Content-Type'),
      elapsedMs:Date.now()-started,parseFailure:true,
    }));
  }
  console.log('Selftest part '+part+' in '+(Date.now()-started)+'ms; '+(self.steps?.length||0)+' steps');
  for(const step of self.steps||[])console.log((step.ok?'PASS':'FAIL')+' '+step.name+' ('+step.ms+'ms)'+(step.ok?'':' — '+step.detail));
  assert.equal(res.ok,true,diagnostic());
  assert.equal(self.ok,true,'selftest part '+part+' did not pass');
  assert.equal(self.steps?.length,self.expected,'selftest part '+part+' did not complete all checks and cleanup');
}
console.log('PASS selftest and verified cleanup');
const options=await fetch(url,{method:'OPTIONS'});
assert.equal(options.status,204,'OPTIONS must return HTTP 204');
assert.equal(options.headers.get('Access-Control-Allow-Origin'),'*','CORS origin missing');
console.log('PASS CORS preflight');
const invalidUrl=url.replace(/[a-f0-9]$/i,c=>c.toLowerCase()==='a'?'b':'a');
assert.notEqual(invalidUrl,url,'MCP_URL must end with the path secret');
const denied=await fetch(invalidUrl,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:0,method:'tools/list',params:{}})});
assert.equal(denied.status,404,'an invalid connector secret must be rejected');
console.log('PASS invalid-secret rejection');
const init=await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'lemma-smoke',version:'1.0.0'}});
assert.ok(init.serverInfo,'initialize missing server info');
console.log('PASS initialize');
const notify=await fetch(url,{method:'POST',headers:headers(),
  body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});
assert.equal(notify.ok,true,'initialized notification returned HTTP '+notify.status);
const tools=await call('tools/list');
assert.equal(tools.tools.length,23,'wrong tool count');
assert.deepEqual(tools.tools.map(t=>t.name).sort(),names.sort(),'tool names differ');
assert.ok(JSON.stringify(tools).length<=15000,'tools/list exceeds 15,000 characters');
for(const t of tools.tools){
  assert.equal(typeof t.description,'string',t.name+' lacks description');
  assert.ok(t.inputSchema,t.name+' lacks schema');
  assert.equal(t.annotations?.readOnlyHint,readTools.has(t.name),t.name+' read-only hint mismatch');
  if(!readTools.has(t.name)){
    assert.equal(t.annotations?.destructiveHint,false,t.name+' must be nondestructive');
    assert.equal(t.annotations?.openWorldHint,false,t.name+' must not be open-world');
  }
}
console.log('PASS tools/list: 23 tools, '+JSON.stringify(tools).length+' characters');
const resumed=await call('tools/call',{name:'resume',arguments:{}});
const resumeText=(resumed.content||[]).map(item=>item.text||'').join('\n');
assert.doesNotMatch(resumeText,/zz-selftest/i,'self-test leaked into owner resume packet');
console.log('PASS self-test fixtures excluded from owner resume');
console.log('PASS all MCP smoke checks');