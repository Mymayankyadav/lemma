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
      return {front:(await s.note('stale')).data.front,archive:(await s.list()).some(op=>op.resolves)};
    });
    ok(stale.front==='newer local' && stale.archive,'stale choice does not overwrite a newer draft');
    // The first successful resolution remains queued, but no second resolution was staged.
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
    await page.locator('.conflict-confirm input[type=checkbox]').first().check();
    await page.getByRole('button',{name:'Save resolution to device'}).click();
    await page.waitForFunction(()=>document.querySelector('.conflict-center')?.textContent.includes('blocked operation'));
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
};
