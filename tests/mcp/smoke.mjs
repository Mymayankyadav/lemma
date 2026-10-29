// Node 22; no dependencies. Set MCP_URL in the environment; do not print it.
import assert from 'node:assert/strict';
const url=process.env.MCP_URL;
if(!url)throw Error('MCP_URL environment variable is required');
const names=['resume','get','read_pages','search','start_session','save_progress','end_session','propose_cards','propose_card_edits','propose_plan','propose_plan_change','create_project','proposals','decide'];
let seq=0;
async function call(method,params={}){
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params})});
  assert.equal(res.ok,true,method+' returned HTTP '+res.status);
  const text=await res.text();
  const record=text.startsWith('event:')?text.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6))).find(x=>x.id===seq):JSON.parse(text);
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