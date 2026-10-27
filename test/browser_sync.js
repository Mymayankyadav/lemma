// Two independent browser caches and a deterministic, fault-injected RPC server.
// This tests the account adapter, not production Supabase login or active UI sync.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const userId = '00000000-0000-4000-8000-000000000001';
const source = fs.readFileSync('src/fsrs.js','utf8') + '\n' +
  ['review_ledger','review_replay','outbox_core','sync_browser']
    .map(f=>fs.readFileSync(`src/app/${f}.js`,'utf8')).join('\n');
(async () => {
  const server = new Map(), receipts = new Map(), requests = [];
  let loseNextResponse = false;
  const send = async ({ payload:p, authorization }) => {
    assert.equal(authorization, 'Bearer token-a');
    requests.push(p.p_request_id);
    if (receipts.has(p.p_request_id)) return { data:receipts.get(p.p_request_id) };
    const previous = server.get(p.p_note_id);
    if ((previous?.revision || 0) !== p.p_expected_revision) return { error:{message:'stale_note_revision'} };
    const revision = (previous?.revision || 0) + 1;
    server.set(p.p_note_id, { id:p.p_note_id, data:p.p_data || previous?.data, revision, deleted_at:p.p_delete ? '2026-10-26' : null });
    receipts.set(p.p_request_id, revision);
    if (loseNextResponse) { loseNextResponse = false; return { error:{message:'network response lost'} }; }
    return { data:revision };
  };
  const browser = await chromium.launch();
  try {
    const contexts = [];
    for (let device = 0; device < 2; device++) {
      const ctx = await browser.newContext(); contexts.push(ctx);
      await ctx.route('https://lemma-sync.test/**', r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Sync adapter test</title>'}));
      await ctx.exposeFunction('sendRPC', send);
      await ctx.addInitScript({ content: source + `\nwindow.sync = LemmaCloud;` });
    }
    async function open(ctx) {
      const page = await ctx.newPage();
      await page.goto('https://lemma-sync.test/');
      await start(page);
      return page;
    }
    async function start(page) {
      await page.evaluate(async userId => {
        let current = {user:{id:userId},access_token:'token-a'};
        const listeners = new Set();
        const client = {
          auth:{ getSession:async()=>({data:{session:current}}), onAuthStateChange:fn=>{
            listeners.add(fn); return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};
          } },
          rpc:(_name,payload)=>({setHeader:(_key,authorization)=>window.sendRPC({payload,authorization})})
        };
        window.account = await window.sync.startAccount(client,userId);
        window.switchUser = () => { current={user:{id:'00000000-0000-4000-8000-000000000002'},access_token:'token-b'}; for(const fn of listeners)fn('SIGNED_IN',current); };
      }, userId);
    }
    const a = await open(contexts[0]), b = await open(contexts[1]);
    const stage = (page,id,front,deleted=false)=>page.evaluate(({id,front,deleted})=>account.storage.stageNote({id,front,back:'',log:[],cards:{}},undefined,deleted),{id,front,deleted});
    const flush = page=>page.evaluate(()=>account.outbox.flush());
    await stage(a,'same','device A'); await stage(b,'same','device B');
    await flush(a); await flush(b);
    assert.equal(server.get('same').data.front,'device A');
    assert.equal(await b.evaluate(async()=>(await account.storage.list())[0].state),'conflict');
    assert.equal(await b.evaluate(async()=>(await account.storage.notes())[0].data.front),'device B');

    // Browser restart preserves retry IDs even when the server committed already.
    await stage(b,'retry','keep'); loseNextResponse = true;
    await flush(b);
    const originalId = await b.evaluate(async()=>(await account.storage.list()).find(o=>o.entityId==='retry').requestId);
    await b.evaluate(row=>account.storage.ingestRemoteNote(row),server.get('retry'));
    assert.equal(await b.evaluate(async()=>(await account.storage.list()).find(o=>o.entityId==='retry').state),'pending');
    await b.reload(); await start(b); await flush(b);
    assert.equal(server.get('retry').revision,1);
    assert.equal(requests.filter(id=>id===originalId).length,2);
    assert.equal(await b.evaluate(async()=>(await account.storage.list()).some(o=>o.entityId==='retry')),false);

    // Two tabs share IDB and actual Web Locks; simultaneous flush must not race.
    const tab = await open(contexts[0]);
    await stage(a,'same','tab one'); await stage(tab,'same','tab two');
    await Promise.all([flush(a),flush(tab)]);
    assert.equal(server.get('same').revision,3);
    assert.equal(server.get('same').data.front,'tab two');
    assert.equal(await a.evaluate(async()=>(await account.storage.list()).length),0);
    await a.evaluate(()=>{ account.outbox.online=false; });
    await stage(a,'offline','durable offline'); await flush(a);
    assert.equal(server.has('offline'),false);
    await a.evaluate(()=>{ account.outbox.online=true; }); await flush(a);
    assert.equal(server.get('offline').data.front,'durable offline');
    await stage(a,'offline','',true); await flush(a);
    assert.ok(server.get('offline').deleted_at);
    await b.evaluate(row=>account.storage.ingestRemoteNote(row),server.get('offline'));
    assert.equal(await b.evaluate(async()=>(await account.storage.notes()).find(n=>n.id==='offline').deleted),true);

    // Offline edit/delete conflict keeps all three versions and later queued
    // edits across a real browser reload. A tombstone never silently wins.
    await stage(a,'race','common base'); await flush(a);
    const baseRow = server.get('race');
    await b.evaluate(row=>account.storage.ingestRemoteNote(row),baseRow);
    const edit = await stage(b,'race','offline edit');
    const laterEdit = await stage(b,'race','later local edit');
    await stage(a,'race','',true); await flush(a); await flush(b);
    await b.evaluate(row=>account.storage.ingestRemoteNote(row),server.get('race'));
    const conflict = await b.evaluate(id=>account.storage.get(id),edit.id);
    assert.deepEqual(conflict.conflict.base,{revision:1,known:true,data:baseRow.data,deleted:false});
    assert.equal(conflict.conflict.local.data.front,'offline edit');
    assert.deepEqual(conflict.conflict.remote,{revision:2,known:true,data:baseRow.data,deleted:true});
    await b.reload(); await start(b);
    assert.deepEqual(await b.evaluate(id=>account.storage.get(id),edit.id),conflict);
    assert.equal(await b.evaluate(async id=>(await account.storage.get(id)).requestId,laterEdit.id),laterEdit.requestId);
    assert.equal(await b.evaluate(async()=>(await account.storage.note('race')).data.front),'later local edit');
    await flush(b);
    assert.equal(server.get('race').revision,2,'unresolved local edits cannot revive the deleted card');

    // Resolve explicitly to the tombstone. Both original edits remain archived,
    // and a lost receipt/reload retries only the new resolution request.
    const review = await b.evaluate(id=>account.storage.inspectConflict(id),edit.id);
    const resolution = await b.evaluate(({id,token})=>account.storage.resolveConflict(id,token,
      {choice:'remote',confirmDelete:true}),review);
    loseNextResponse = true; await flush(b);
    assert.equal(server.get('race').revision,3);
    await b.reload(); await start(b);
    const repeated = await b.evaluate(({id,token})=>account.storage.resolveConflict(id,token,
      {choice:'remote',confirmDelete:true}),review);
    assert.equal(repeated.requestId,resolution.requestId);
    await flush(b);
    assert.equal(requests.filter(id=>id===resolution.requestId).length,2);
    assert.equal(server.get('race').revision,3);
    assert.ok(server.get('race').deleted_at);
    const archive = await b.evaluate(id=>account.storage.resolution(id),edit.id);
    assert.deepEqual(archive.reviewed.queued.map(op=>op.requestId),[edit.requestId,laterEdit.requestId]);
    assert.equal(archive.acknowledgment.revision,3);
    assert.equal(await b.evaluate(async()=>(await account.storage.note('race')).dirty),false);

    // A local edit invalidates an open comparison. A newer server edit after
    // a valid choice causes another conflict rather than overwriting that edit.
    await b.evaluate(row=>account.storage.ingestRemoteNote(row),server.get('same'));
    const firstId = await b.evaluate(async()=>(await account.storage.list()).find(op=>op.entityId==='same').id);
    const staleView = await b.evaluate(id=>account.storage.inspectConflict(id),firstId);
    await stage(b,'same','newest local');
    await assert.rejects(b.evaluate(({id,token})=>account.storage.resolveConflict(id,token,{choice:'local'}),staleView),/Conflict changed/);
    const currentView = await b.evaluate(id=>account.storage.inspectConflict(id),firstId);
    const firstChoice = await b.evaluate(({id,token})=>account.storage.resolveConflict(id,token,{choice:'local'}),currentView);
    await stage(a,'same','new remote'); await flush(a); await flush(b);
    assert.equal(server.get('same').data.front,'new remote');
    assert.equal(await b.evaluate(async id=>(await account.storage.get(id)).state,firstChoice.id),'conflict');
    await b.evaluate(row=>account.storage.ingestRemoteNote(row),server.get('same'));
    const freshView = await b.evaluate(id=>account.storage.inspectConflict(id),firstChoice.id);
    const finalChoice = await b.evaluate(({id,token})=>account.storage.resolveConflict(id,token,{choice:'local'}),freshView);
    await flush(b);
    assert.equal(server.get('same').data.front,'newest local');
    assert.equal(server.get('same').revision,5);
    assert.equal((await b.evaluate(id=>account.storage.resolution(id),firstId)).supersededBy,finalChoice.id);

    // SYNC-03: two independent Chromium IndexedDB caches, concurrent
    // offline reviews, one Undo, explicit choices and reload converge to
    // the same due date without trusting either remote card snapshot.
    const replayId = 'replay-browser';
    const blank = {st:0,due:0,s:0,d:0,last:0,step:0,reps:0,lapses:0};
    const baseReplay = {id:replayId,front:'Prove the lemma',back:'',cards:{1:blank},log:[]};
    await a.evaluate(row=>account.storage.ingestRemoteNote(row),{
      id:replayId,data:baseReplay,revision:1
    });
    await b.evaluate(row=>account.storage.ingestRemoteNote(row),{
      id:replayId,data:baseReplay,revision:1
    });
    async function offlineReview(page, grade, id, hour) {
      return page.evaluate(async ({grade,id,hour}) => {
        const s=account.storage, note=(await s.note('replay-browser')).data;
        const at=Date.UTC(2026,9,27,8+hour);
        const offset=-330*60000+4*3600000;
        const prov={version:1,algorithm:'fsrs-6',weights:FSRS.DEFAULT_W.slice(),
          day_index:Math.floor((at-offset)/86400000),
          rollover_hour:4,timezone_offset_minutes:-330,
          retention:.9,max_interval_days:36500,learn_steps:'1m 10m',relearn_steps:'10m',
          fuzz:true,load_balance:false,preview_at_ms:at,
          card_before:structuredClone(note.cards[1])};
        const entry=[at,1,grade,0,500,0,id,prov];
        const card=FSRS.preview(note.cards[1],at,{
          w:prov.weights,retention:.9,maxIvl:36500,learn:[1,10],relearn:[10],
          fuzz:true,loadBalance:false
        },{
          clock:{dayIndex:ts=>Math.floor((ts-offset)/86400000),
            dayStart:i=>i*86400000+offset},key:note.id+':1'
        })[grade].card;
        const snapshot={...note,cards:{1:card},log:[entry]};
        const op=await s.stageReview(snapshot,entry);
        await s.markAttempt(op.id);
        await s.markConflict(op.id,new Error('stale_note_revision'));
        return {opId:op.id,snapshot,event:{
          event_id:id,note_id:note.id,ordinal:1,occurred_at_ms:at,
          grade,state_before:0,duration_ms:500,kind:0,scheduling_provenance:prov
        }};
      },{grade,id,hour});
    }
    const reviewA=await offlineReview(a,3,'00000000-0000-4000-8000-000000000201',0);
    const reviewB=await offlineReview(b,1,'00000000-0000-4000-8000-000000000202',1);
    // Propagate only signed-in owner's remote immutable records and snapshots.
    await a.evaluate(x=>account.storage.ingestReview(x),reviewB.event);
    await b.evaluate(x=>account.storage.ingestReview(x),reviewA.event);
    await a.evaluate(row=>account.storage.ingestRemoteNote(row),
      {id:replayId,data:reviewB.snapshot,revision:2});
    await b.evaluate(row=>account.storage.ingestRemoteNote(row),
      {id:replayId,data:reviewA.snapshot,revision:2});
    await b.evaluate(async id => {
      const note={id:'replay-browser',front:'Prove the lemma',back:'',
        cards:{1:{st:0,due:0,s:0,d:0,last:0,step:0,reps:0,lapses:0}},log:[]};
      await account.storage.stageUndo(note,id);
    },reviewB.event.event_id);
    const undoRow=await b.evaluate(async()=> (await account.storage.retractions())[0]);
    await a.evaluate(row=>account.storage.ingestRetraction(row),undoRow);
    for (const [page,opId] of [[a,reviewA.opId],[b,reviewB.opId]]) {
      await page.evaluate(async id => {
        const s=account.storage, view=await s.inspectConflict(id);
        await s.resolveConflict(id,view.token,{choice:'remote'});
      },opId);
    }
    const dueState=page=>page.evaluate(async()=> {
      const card=(await account.storage.note('replay-browser')).data;
      return {due:card.cards[1].due,reps:card.cards[1].reps,
        ids:card.log.map(x=>x[6])};
    });
    assert.deepEqual(await dueState(a),await dueState(b));
    assert.deepEqual((await dueState(a)).ids,[reviewA.event.event_id]);
    await a.reload();await b.reload();await start(a);await start(b);
    assert.deepEqual(await dueState(a),await dueState(b),'restart cannot change the projected due date');

    // A stale account handle is stopped when another user signs in.
    await stage(tab,'must-not-send','private A');
    await tab.evaluate(()=>window.switchUser());
    assert.equal((await flush(tab)).stopped,true);
    assert.equal(server.has('must-not-send'),false);
    for(const ctx of contexts) await ctx.close();
    console.log('ok: two-browser conflict resolution, archives, lost-response restart, stale choices, Web Locks, tombstones and account stop');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
