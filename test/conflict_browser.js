'use strict';
// Browser-level SYNC-02 panel checks: real IndexedDB, mocked auth/transport.
// This does NOT assert live Supabase convergence or public sync activation.
module.exports = async ({browser, newPage, ok}) => {
  const A = '00000000-0000-4000-8000-000000000081';
  const B = '00000000-0000-4000-8000-000000000082';
  const {ctx,page} = await newPage(browser,{mock:false,label:'conflict-ui',editorHooks:true});
  const note = (id,front) => ({id,front,back:'Proof details',title:'Proof '+id,
    deck:'Algebra',type:'basic',cards:{},log:[]});
  try {
    await page.waitForSelector('.onboard');
    await page.evaluate(async ({A}) => {
      const {LemmaCloud,LemmaAccount} = __editor;
      const callbacks = new Set();
      const client = {
        auth:{
          onAuthStateChange(fn) { callbacks.add(fn); return {data:{subscription:{unsubscribe:()=>callbacks.delete(fn)}}}; },
          getUser:async()=>({data:{user:null},error:null})
        },
        channel() { return {on() { return this; },subscribe(fn) { fn('SUBSCRIBED'); return this; }}; },
        removeChannel:async()=>{}
      };
      LemmaCloud.startAccount = async (_client, id) => {
        const db = await LemmaCloud.openAccountDB(id);
        const storage = new LemmaCloud.AccountStorage(db,id);
        if (id === A) {
          const make = (name,front) => ({id:name,front,back:'Proof details',title:'Proof '+name,
            deck:'Algebra',type:'basic',cards:{},log:[]});
          const basic = make('proof','common');
          await storage.ingestRemoteNote({id:'proof',data:basic,revision:1});
          const first = await storage.stageNote(make('proof','offline first'));
          await storage.stageNote(make('proof','latest local'));
          await storage.markAttempt(first.id);
          await storage.markConflict(first.id,new Error('stale_note_revision'));
          await storage.ingestRemoteNote({id:'proof',data:make('proof','server copy'),revision:2});
        }
        const outbox = {pending:()=>storage.list(),flush:async()=>({}),stopped:false};
        const close = () => {outbox.stopped = true;db.close();};
        return {storage,outbox,pull:async()=>{},close,userId:id};
      };
      window.LEMMA_CONFIG = {url:'https://mock-account.invalid',publishableKey:'mock'};
      window.LemmaSupabase = {createClient:()=>client};
      LemmaAccount.init();
      window.__conflictAuth = { emit(id) {
        for (const fn of callbacks) fn(id?'SIGNED_IN':'SIGNED_OUT',id?{user:{id,email:'test@example.invalid'}}:null);
      }};
      __conflictAuth.emit(A);
    },{A});
    await page.waitForFunction(A => __editor.LemmaSync.status.userId === A &&
      __editor.LemmaSync.status.phase === 'conflict',A);
    await page.click('.tab[data-go="settings"]');
    await page.getByRole('button',{name:'Review account conflicts'}).click();
    await page.getByRole('button',{name:'Compare versions'}).first().click();
    await page.waitForSelector('.conflict-review');
    const previews = await page.locator('.conflict-version').allTextContents();
    ok(previews.length===3 && previews[0].includes('common') &&
      previews[1].includes('latest local') && previews[2].includes('server copy'),
      'conflict panel shows base, latest local and server evidence');
    ok((await page.locator('.conflict-history-row').count())===2,
      'queued edits are visible before a decision');
    await page.screenshot({path:require('node:path').resolve(__dirname,'../test-output/SYNC02-conflict-compare.png')});
    await page.selectOption('.conflict-controls select','remote');
    await page.getByRole('button',{name:'Save resolution to device'}).click();
    await page.waitForFunction(()=>document.querySelector('.conflict-center')?.textContent.includes('No unresolved conflicts'));
    const first = await page.evaluate(async () => {
      const s=__editor.LemmaSync.accountHandle().storage, archives=await s.list();
      const row=await s.note('proof');
      const resolved=archives.find(op=>op.resolves);
      return {front:row.data.front,dirty:row.dirty,reviewed:(await s.resolution(resolved.resolves)).reviewed.queued.length,
        expected:resolved.expectedRevision};
    });
    ok(first.front==='server copy' && first.dirty && first.reviewed===2 && first.expected===2,
      'explicit server choice archives both edits and stages a new revision');

    // A newer local edit invalidates an open comparison, preserving the draft.
    await page.evaluate(async () => {
      const s=__editor.LemmaSync.accountHandle().storage;
      const make=(id,front)=>({id,front,back:'',cards:{},log:[]});
      await s.ingestRemoteNote({id:'stale',data:make('stale','base'),revision:1});
      const old=await s.stageNote(make('stale','local'));
      await s.markAttempt(old.id);await s.markConflict(old.id,new Error('stale_note_revision'));
      await s.ingestRemoteNote({id:'stale',data:make('stale','remote'),revision:2});
    });
    await page.getByRole('button',{name:'Review account conflicts'}).click();
    await page.getByRole('button',{name:'Compare versions'}).first().click();
    await page.waitForSelector('.conflict-review');
    await page.evaluate(async () => {
      const s=__editor.LemmaSync.accountHandle().storage;
      await s.stageNote({id:'stale',front:'newer local',back:'',cards:{},log:[]});
    });
    await page.selectOption('.conflict-controls select','remote');
    await page.getByRole('button',{name:'Save resolution to device'}).click();
    await page.waitForFunction(()=>document.querySelector('.conflict-controls [role=status]')?.textContent.includes('Conflict changed'));
    const stale = await page.evaluate(async () => {
      const s=__editor.LemmaSync.accountHandle().storage;
      return {front:(await s.note('stale')).data.front,archive:(await s.list()).some(op=>op.entityId === 'stale' && op.resolves)};
    });
    ok(stale.front==='newer local' && !stale.archive,'stale choice does not overwrite a newer draft');
    // The first successful resolution remains queued; no stale choice was committed.
    ok((await page.locator('.conflict-controls button:disabled').count())===0,
      'stale choice leaves the panel editable for recovery');

    // Delete and restore are never implicit.
    await page.evaluate(async () => {
      const s=__editor.LemmaSync.accountHandle().storage;
      const make=(id,front)=>({id,front,back:'',cards:{},log:[]});
      await s.ingestRemoteNote({id:'deleted',data:make('deleted','original'),revision:1});
      const op=await s.stageNote(make('deleted','keep local'));
      await s.markAttempt(op.id);await s.markConflict(op.id,new Error('stale_note_revision'));
      await s.ingestRemoteNote({id:'deleted',data:make('deleted','server original'),revision:2,
        deleted_at:'2026-10-27T00:00:00Z'});
    });
    await page.getByRole('button',{name:'Back to conflicts'}).click();
    await page.getByRole('button',{name:'Compare versions'}).filter({hasText:'Compare versions'}).last().click();
    // Select the explicit server tombstone, and require a checked confirmation.
    await page.selectOption('.conflict-controls select','remote');
    await page.getByRole('button',{name:'Save resolution to device'}).click();
    ok((await page.locator('.conflict-controls [role=status]').textContent()).includes('Confirm deletion'),
      'delete choice requires explicit confirmation');
    const deleteConsent = page.getByLabel('I understand this will delete the card in my account.');
    await deleteConsent.check();
    ok(await deleteConsent.isChecked(), 'deletion consent is checked before saving');
    await page.getByRole('button',{name:'Save resolution to device'}).click();
    try {
      await page.waitForFunction(()=>document.querySelector('.conflict-center')?.textContent.includes('blocked operation'),null,{timeout:12000});
    } catch (error) {
      const detail = await page.evaluate(async () => ({
        panel: document.querySelector('.conflict-center')?.textContent,
        alert: document.querySelector('.conflict-controls [role=status]')?.textContent,
        consent: [...document.querySelectorAll('.conflict-review .conflict-confirm input')].map(x=>({checked:x.checked,hidden:x.closest('label')?.hidden})),
        saveDisabled: document.querySelector('.conflict-controls .btn-primary')?.disabled,
        note: await __editor.LemmaSync.accountHandle().storage.note('deleted'),
        outbox: (await __editor.LemmaSync.accountHandle().storage.list()).map(o=>({
          id:o.id,kind:o.kind,entityId:o.entityId,state:o.state,resolves:o.resolves
        }))
      }));
      throw new Error('Delete-resolution UI did not reload: '+JSON.stringify(detail)+'; '+error.message);
    }
    ok(await page.evaluate(async()=> (await __editor.LemmaSync.accountHandle().storage.note('deleted')).deleted),
      'confirmed delete is durably staged as a tombstone');

    // Switch accounts while a prior comparison is open: no stale account action.
    await page.getByRole('button',{name:'Compare versions'}).first().click();
    await page.waitForSelector('.conflict-review');
    const before = await page.evaluate(async()=> (await __editor.LemmaSync.accountHandle().storage.list()).length);
    await page.evaluate(B => __conflictAuth.emit(B),B);
    await page.getByRole('button',{name:'Save resolution to device'}).click();
    const after = await page.evaluate(async()=> {
      const storage=__editor.LemmaSync.accountHandle()?.storage;
      return {account:__editor.LemmaAccount.user?.id, state:__editor.Store.mode,
        count:storage? (await storage.list()).length:0};
    });
    ok(after.account===B && after.state==='local' && before>0,
      'switching accounts prevents a stale panel from resolving into the next account');
  } finally {await ctx.close();}

  // Full application smoke: independent Chromium contexts, concurrent offline
  // grades, an Undo, explicit conflict-panel resolution and browser reload.
  // Transport and auth are mocked. This is not evidence of live cloud sync.
  const userId = '00000000-0000-4000-8000-000000000093';
  const noteId = 'review-ui';
  const baseline = {st:0,due:0,s:0,d:0,last:0,step:0,reps:0,lapses:0};
  const baseNote = {id:noteId,title:'Replay due-date smoke',front:'Prove this lemma',
    back:'Proof',type:'basic',deck:'Algebra',cards:{'1':baseline},log:[]};
  const pages = [];
  async function setup(page) {
    await page.waitForSelector('.onboard');
    await page.evaluate(async id => {
      const {LemmaCloud,LemmaAccount} = window.__editor;
      const callbacks = new Set();
      const client = {
        auth:{
          onAuthStateChange(fn) { callbacks.add(fn); return {data:{subscription:{unsubscribe:()=>callbacks.delete(fn)}}}; },
          getUser:async()=>({data:{user:null},error:null})
        },
        channel(){return {on(){return this;},subscribe(fn){fn('SUBSCRIBED');return this;}};},
        removeChannel:async()=>{}
      };
      LemmaCloud.startAccount = async (_client, accountId) => {
        const db = await LemmaCloud.openAccountDB(accountId);
        const storage = new LemmaCloud.AccountStorage(db,accountId);
        const outbox = {pending:()=>storage.list(),flush:async()=>({}),stopped:false};
        return {storage,outbox,pull:async()=>{},close:()=>{outbox.stopped=true;db.close();},
          userId:accountId};
      };
      window.LEMMA_CONFIG={url:'https://mock-replay.invalid',publishableKey:'mock'};
      window.LemmaSupabase={createClient:()=>client};
      LemmaAccount.init();
      for (const fn of callbacks) fn('SIGNED_IN',{user:{id,email:'test@example.invalid'}});
    }, userId);
    await page.waitForFunction(id => __editor.LemmaSync.status.userId === id &&
      __editor.LemmaSync.status.phase === 'ready', userId);
  }
  async function activate(page) {
    await page.evaluate(async()=> {
      const app=__editor.App, handle=__editor.LemmaSync.accountHandle();
      if (!(await handle.storage.note('review-ui'))) throw new Error('Missing replay note');
      await app.workspaceController.activate();
    });
    await page.waitForFunction(()=>__editor.Store.mode==='account');
  }
  try {
    for (let i=0;i<2;i++) {
      const bundle=await newPage(browser,{mock:false,label:'replay-ui-'+i,editorHooks:true});
      pages.push(bundle);
      await setup(bundle.page);
      await bundle.page.evaluate(row => __editor.LemmaSync.accountHandle().storage.ingestRemoteNote(row),
        {id:noteId,data:baseNote,revision:1});
      await activate(bundle.page);
    }
    async function grade(page,number,ident,hours) {
      return page.evaluate(async ({number,ident,hours}) => {
        const {FSRS,LemmaSync} = __editor;
        const storage=LemmaSync.accountHandle().storage;
        const note=(await storage.note('review-ui')).data;
        const timestamp=Date.UTC(2026,9,27,8+hours);
        const tz=-330,rollover=4,delta=tz*60000+rollover*3600000;
        const p={version:1,algorithm:'fsrs-6',weights:FSRS.DEFAULT_W.slice(),
          day_index:Math.floor((timestamp-delta)/86400000),rollover_hour:rollover,
          timezone_offset_minutes:tz,retention:.9,max_interval_days:36500,
          learn_steps:'1m 10m',relearn_steps:'10m',fuzz:true,load_balance:false,
          preview_at_ms:timestamp,card_before:structuredClone(note.cards[1])};
        const entry=[timestamp,1,number,0,500,0,ident,p];
        const config={w:p.weights,retention:p.retention,maxIvl:p.max_interval_days,
          learn:[1,10],relearn:[10],fuzz:true,loadBalance:false};
        const clock={dayIndex:ts=>Math.floor((ts-delta)/86400000),
          dayStart:day=>day*86400000+delta};
        const card=FSRS.preview(note.cards[1],timestamp,config,{clock,key:note.id+':1'})[number].card;
        const snapshot={...note,cards:{'1':card},log:[entry]};
        const op=await storage.stageReview(snapshot,entry);
        await storage.markAttempt(op.id);
        await storage.markConflict(op.id,new Error('stale_note_revision'));
        return {opId:op.id,snapshot,event:{
          event_id:ident,note_id:note.id,ordinal:1,occurred_at_ms:timestamp,
          grade:number,state_before:0,duration_ms:500,kind:0,scheduling_provenance:p
        }};
      },{number,ident,hours});
    }
    const reviewA=await grade(pages[0].page,3,'00000000-0000-4000-8000-000000000301',0);
    const reviewB=await grade(pages[1].page,1,'00000000-0000-4000-8000-000000000302',1);
    await pages[0].page.evaluate(x=>__editor.LemmaSync.accountHandle().storage.ingestReview(x),reviewB.event);
    await pages[1].page.evaluate(x=>__editor.LemmaSync.accountHandle().storage.ingestReview(x),reviewA.event);
    for (const [bundle,remote] of [[pages[0],reviewB],[pages[1],reviewA]])
      await bundle.page.evaluate(data => __editor.LemmaSync.accountHandle().storage.ingestRemoteNote(
        {id:'review-ui',data,revision:2}),remote.snapshot);
    await pages[1].page.evaluate(async ({id,note}) => {
      await __editor.LemmaSync.accountHandle().storage.stageUndo(note,id);
    },{id:reviewB.event.event_id,note:baseNote});
    const retract=await pages[1].page.evaluate(async()=>(
      await __editor.LemmaSync.accountHandle().storage.retractions())[0]);
    await pages[0].page.evaluate(x=>__editor.LemmaSync.accountHandle().storage.ingestRetraction(x),retract);

    for (const bundle of pages) {
      const p=bundle.page;
      await p.click('.tab[data-go="settings"]');
      await p.getByRole('button',{name:'Review account conflicts'}).click();
      await p.getByRole('button',{name:'Compare versions'}).first().click();
      await p.waitForSelector('.conflict-review');
      ok((await p.locator('.conflict-warning').count())===0,
        'replay-backed conflict is eligible for an explicit choice');
      await p.selectOption('.conflict-controls select','remote');
      await p.getByRole('button',{name:'Save resolution to device'}).click();
      await p.waitForFunction(()=>document.querySelector('.conflict-center')?.textContent.includes('No unresolved conflicts'));
      // Mock confirmed delivery after a successful explicit choice, preserving
      // immutable local review/retraction history for the upcoming reload.
      await p.evaluate(async()=> {
        const storage=__editor.LemmaSync.accountHandle().storage;
        for (const op of await storage.list())
          if (op.state==='pending') await storage.ack(op,
            op.kind==='note'||op.kind==='profile'
              ? {revision:op.expectedRevision+1} : {});
      });
    }
    async function shownDue(page) {
      await page.click('.tab[data-go="browse"]');
      await page.locator('.note-row').first().click();
      await page.waitForSelector('.detail .facts');
      return page.evaluate(()=>({
        text:document.querySelector('.detail .facts dd:nth-of-type(2)')?.textContent ||
          document.querySelectorAll('.detail .facts dd')[1]?.textContent,
        raw:__editor.Model.notes.get('review-ui')?.cards?.['1']?.due
      }));
    }
    const initialDue=await Promise.all(pages.map(bundle=>shownDue(bundle.page)));
    ok(initialDue[0].raw===initialDue[1].raw && initialDue[0].text===initialDue[1].text &&
       !!initialDue[0].raw,'both active app views show the same projected due date');
    for (const bundle of pages) {
      await bundle.page.reload();
      await setup(bundle.page);
      await activate(bundle.page);
    }
    const afterReload=await Promise.all(pages.map(bundle=>shownDue(bundle.page)));
    ok(afterReload[0].raw===afterReload[1].raw &&
       afterReload[0].text===afterReload[1].text &&
       afterReload[0].raw===initialDue[0].raw,
      'reloaded app views retain matching due dates after offline review and Undo');
  } finally {
    for (const bundle of pages) await bundle.ctx.close();
  }
};
