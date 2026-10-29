// Node 22; no dependencies. Set MCP_URL in the environment; do not print it.
import assert from 'node:assert/strict';
const url=process.env.MCP_URL;
if(!url)throw Error('MCP_URL environment variable is required');
const names=['resume','get','read_pages','search','start_session','save_progress','end_session','propose_cards','propose_card_edits','propose_plan','propose_plan_change','create_project','proposals','decide'];
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
const res=await fetch(url+'/selftest');
const self=await res.json();
for(const step of self.steps||[])console.log((step.ok?'PASS':'FAIL')+' '+step.name+(step.ok?'':' — '+step.detail));
assert.equal(res.ok,true,'selftest HTTP error');
assert.equal(self.ok,true,'selftest did not pass');
console.log('PASS selftest');
const init=await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'lemma-smoke',version:'1.0.0'}});
assert.ok(init.serverInfo,'initialize missing server info');
console.log('PASS initialize');
const notify=await fetch(url,{method:'POST',headers:headers(),
  body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});
assert.equal(notify.ok,true,'initialized notification returned HTTP '+notify.status);
const tools=await call('tools/list');
assert.equal(tools.tools.length,14,'wrong tool count');
assert.deepEqual(tools.tools.map(t=>t.name).sort(),names.sort(),'tool names differ');
assert.ok(JSON.stringify(tools).length<=10500,'tools/list exceeds 10,500 characters');
for(const t of tools.tools){
  assert.equal(typeof t.description,'string',t.name+' lacks description');
  assert.ok(t.inputSchema,t.name+' lacks schema');
}
console.log('PASS tools/list: 14 tools, '+JSON.stringify(tools).length+' characters');
console.log('PASS all MCP smoke checks');