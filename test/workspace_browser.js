'use strict';
// Full app/Store/editor/controller and real browser account databases. Only
// auth events and remote transport are mocked; this is not live Supabase login.
module.exports = async ({ browser, newPage, ok }) => {
  const A = '00000000-0000-4000-8000-000000000001';
  const B = '00000000-0000-4000-8000-000000000002';
  const { ctx, page } = await newPage(browser, { mock:false, label:'identity', editorHooks:true });
  try {
    await page.waitForSelector('.onboard');
    const anonymousId = await page.evaluate(async ({ A, B }) => {
      const { Model, Store, LemmaCloud, LemmaOutboxCore, LemmaAccount } = __editor;
      const anonymous = Model.createNote({ front:'Anonymous card', back:'device only', deck:'Local' });
      await Store.whenSaved();
      localStorage.setItem('lemma.draft.v1', JSON.stringify({ type:'basic', deck:'Local', title:'',
        front:'Anonymous draft', back:'', tags:'', requires:[], media:{} }));
      const callbacks = new Set();
      let session = null;
      const client = {
        auth: {
          onAuthStateChange(fn) { callbacks.add(fn); return { data:{subscription:{unsubscribe:() => callbacks.delete(fn)}} }; },
          getUser:async () => ({data:{user:null},error:null})
        },
        channel() { return { on() { return this; }, subscribe(fn) { fn('SUBSCRIBED'); return this; } }; },
        removeChannel:async () => {}
      };
      // Reuse real account cache and outbox implementations while replacing
      // network access with successful, deterministic owner-scoped receipts.
      LemmaCloud.startAccount = async (_client, userId) => {
        const db = await LemmaCloud.openAccountDB(userId);
        const storage = new LemmaCloud.AccountStorage(db, userId);
        if (!(await storage.notes()).length) {
          const seed = Model.sanitizeNote({ id:'seed-' + userId, front:userId === A ? 'Private A' : 'Private B',
            back:'', deck:'Account', cards:{}, log:[] });
          await storage.ingestRemoteNote({ id:seed.id, data:seed, revision:1 });
        }
        const outbox = new LemmaOutboxCore.Processor(storage, {
          send:async op => ({revision:(op.expectedRevision || 0) + 1})
        });
        let subscription;
        const close = () => { outbox.stopped = true; db.close(); subscription?.unsubscribe(); };
        subscription = client.auth.onAuthStateChange((_event, next) => {
          if (next?.user?.id !== userId) close();
        }).data.subscription;
        return { userId, storage, outbox, pull:async () => {}, close };
      };
      window.LEMMA_CONFIG = {url:'https://account-mock.test',publishableKey:'test-only'};
      window.LemmaSupabase = {createClient:() => client};
      LemmaAccount.init();
      window.__identity = {
        emit(id) {
          session = id ? {user:{id},access_token:'mock-token'} : null;
          for (const fn of callbacks) fn(id ? 'SIGNED_IN' : 'SIGNED_OUT', session);
        }
      };
      __identity.emit(A);
      return anonymous.id;
    }, { A, B });
    const activate = async id => {
      await page.waitForFunction(id => __editor.Store.mode === 'local' &&
        __editor.LemmaSync.status.userId === id && __editor.LemmaSync.status.phase === 'ready' &&
        !__editor.LemmaSync.status.pending && __editor.LemmaSync.accountHandle() &&
        !__editor.LemmaSync.accountHandle().outbox.stopped, id);
      await page.evaluate(() => __editor.App.workspaceController.activate());
    };
    const change = id => page.evaluate(id => {
      __identity.emit(id);
      return {blocked:__editor.App.workspaceBlocked, notes:__editor.Model.notes.size, sheets:__editor.Sheets.count};
    }, id);
    const openEditor = async () => {
      await page.keyboard.press('n');
      await page.waitForSelector('#ed-front');
    };
    const closeSheet = async selector => {
      await page.click('.sheet-head .icon-btn[aria-label="Close"]');
      await page.waitForSelector(selector, {state:'hidden'});
    };
    await activate(A);
    ok(await page.evaluate(id => !__editor.Model.notes.has(id) && __editor.Model.notes.size === 1, anonymousId),
      'explicit account activation leaves anonymous cards in their original database');
    const rapid = await page.evaluate(({ A, B }) => {
      __identity.emit(B); __identity.emit(A);
      return {blocked:__editor.App.workspaceBlocked, notes:__editor.Model.notes.size};
    }, { A, B });
    ok(rapid.blocked && rapid.notes === 0, 'rapid A to B to A invalidates the old workspace synchronously');
    await activate(A);
    await openEditor();
    ok(await page.inputValue('#ed-front') === '', 'account A cannot read the anonymous editor draft');
    await page.fill('#ed-front', 'A-only draft');
    await closeSheet('#ed-front');
    const scrub = await change(B);
    ok(scrub.blocked && scrub.notes === 0 && scrub.sheets === 0,
      'auth callback hides account A synchronously before returning for account B');
    await activate(B);
    await openEditor();
    ok(await page.inputValue('#ed-front') === '', 'account B cannot read account A draft');
    await page.fill('#ed-front', 'B-only draft');
    await closeSheet('#ed-front');
    await change(A);
    await activate(A);
    await openEditor();
    ok(await page.inputValue('#ed-front') === 'A-only draft', 'A to B to A restores only A draft');

    // The cache transaction commits, but Save's receipt is held until sign-out.
    await page.evaluate(() => {
      const storage = __editor.LemmaSync.accountHandle().storage;
      const stage = storage.stageNote.bind(storage);
      let release;
      const gate = new Promise(resolve => {release=resolve;});
      __identity.committed = false;
      __identity.releaseSave = release;
      storage.stageNote = async (...args) => {
        const result = await stage(...args);
        __identity.committed = true;
        await gate;
        return result;
      };
    });
    await page.click('.sheet-foot .btn-primary');
    await page.waitForFunction(() => __identity.committed);
    const signedOut = await change(null);
    ok(signedOut.blocked && signedOut.notes === 0 && signedOut.sheets === 0,
      'sign-out during a pending Save immediately removes the old editor and account projection');
    await page.evaluate(() => __identity.releaseSave());
    await page.waitForFunction(() => __editor.Store.mode === 'local' && !__editor.App.workspaceBlocked);
    ok(await page.evaluate(id => __editor.Model.notes.has(id) && __editor.Model.notes.size === 1 &&
      JSON.parse(localStorage.getItem('lemma.draft.v1')).front === 'Anonymous draft', anonymousId),
      'late save receipt leaves anonymous cards and draft intact');
    await change(B);
    await activate(B);
    await openEditor();
    ok(await page.inputValue('#ed-front') === 'B-only draft', 'late A save never replaces B draft');
    await closeSheet('#ed-front');
    await change(A);
    await activate(A);
    await openEditor();
    ok(await page.inputValue('#ed-front') === '' && await page.isVisible('.ed-restored') &&
      await page.evaluate(() => __editor.Model.notes.size === 2 &&
        [...__editor.Model.notes.values()].some(n => n.front === 'A-only draft')),
      'returning to A recovers the committed Save without duplicate creation');
    await closeSheet('#ed-front');

    // A delayed import file read cannot fill a new account's import sheet.
    await page.evaluate(() => {
      window.FileReader = class {
        readAsText() {
          __identity.finishRead = () => { this.result='Q: A private import\nA: keep private'; this.onload(); };
        }
      };
      __editor.ImportSheet.open();
    });
    await page.setInputFiles('#imp-file', {name:'private-A.txt',mimeType:'text/plain',buffer:Buffer.from('private A')});
    const importing = await change(B);
    ok(importing.blocked && importing.notes === 0 && importing.sheets === 0,
      'account change closes an import before its file read completes');
    await activate(B);
    await page.evaluate(() => __editor.ImportSheet.open());
    await page.waitForSelector('#imp-text');
    await page.evaluate(() => __identity.finishRead());
    ok(await page.inputValue('#imp-text') === '' && await page.evaluate(() =>
      __editor.Model.notes.size === 1 && [...__editor.Model.notes.values()][0].front === 'Private B'),
      'stale import callback cannot reveal or import A text into B');
    // Now change identity during the actual durable import write phase.
    const importSource=JSON.stringify([{front:'B import first',back:'one'},{front:'B import second',back:'two'}]);
    await page.fill('#imp-text',importSource);
    await page.waitForFunction(()=>!document.querySelector('.sheet-foot .btn-primary').disabled);
    await page.evaluate(()=>{
      const storage=__editor.LemmaSync.accountHandle().storage;
      const stage=storage.stageNote.bind(storage);
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      __identity.importCommitted=false;
      __identity.releaseImport=release;
      storage.stageNote=async (...args)=>{
        const result=await stage(...args);
        __identity.importCommitted=true;
        await gate;
        return result;
      };
    });
    await page.click('.sheet-foot .btn-primary');
    await page.waitForFunction(()=>__identity.importCommitted);
    const duringImport=await change(A);
    ok(duringImport.blocked && duringImport.notes===0 && duringImport.sheets===0,
      'identity change hides an import while its durable write receipt is pending');
    await page.evaluate(()=>__identity.releaseImport());
    await activate(A);
    await page.evaluate(()=>__editor.ImportSheet.open());
    ok(await page.inputValue('#imp-text')==='' && await page.evaluate(()=>
      ![...__editor.Model.notes.values()].some(n=>n.front.startsWith('B import'))),
      'late B import cannot write remaining cards or reveal its recovery source in A');
    await closeSheet('#imp-text');
    await change(B);
    await activate(B);
    await page.evaluate(()=>__editor.ImportSheet.open());
    await page.waitForFunction(()=>!document.querySelector('.sheet-foot .btn-primary').disabled);
    ok(await page.inputValue('#imp-text')===importSource,'returning to B restores its interrupted import source');
    await page.click('.sheet-foot .btn-primary');
    await page.waitForSelector('#imp-text',{state:'hidden'});
    ok(await page.evaluate(()=>__editor.Model.notes.size===3 &&
      [...__editor.Model.notes.values()].filter(n=>n.front.startsWith('B import')).length===2),
      'interrupted account import resumes without duplicate cards');
    await page.evaluate(() => __editor.App.workspaceController.deactivate());
    await page.reload();
    await page.waitForSelector('.today');
    ok(await page.evaluate(id => __editor.Store.mode === 'local' && __editor.Model.notes.has(id) &&
      __editor.Model.notes.size === 1 && JSON.parse(localStorage.getItem('lemma.draft.v1')).front === 'Anonymous draft', anonymousId),
      'anonymous data remains intact after account transitions and browser reload');
  } finally { await ctx.close(); }
};
