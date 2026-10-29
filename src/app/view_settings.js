/* ---------- settings ---------- */
const AGENT_HELP = [
  'Add flashcards to my Lemma deck (the artifact link is below). Do not read the page source; the format is:',
  '- Use ArtifactData on that link. Write each card with action "set" (use "batch" for several) to collection "data/users/me/profile/notes", one document per card, doc_id = a short unique id such as "c-<topic>-<n>".',
  '- Fields: {"deck": "Math::Topic", "type": "basic" | "reverse" | "cloze", "title": "short name or empty", "front": "...", "back": "...", "tags": ["..."], "requires": ["titles of prerequisite cards"]}. Nothing else is needed; scheduling fields are added automatically.',
  '- Text is Markdown with KaTeX: $inline$, $$display$$. Blocks: ":::theorem[Name]" ... ":::" (also definition, lemma, proof, hint). ":::proof*" with a numbered list reveals one step at a time.',
  '- Cloze cards put {{c1::hidden}} or {{c1::hidden::hint}} in "front" (works inside math). [[Title]] links to another card.',
  'Cards:',
].join('\n');

/* Device-local Android reminder preference. Never part of the synced profile:
   granting Android permission does not constitute Lemma opt-in. */
const ReminderSettings = (() => {
  const KEY = 'lemma-due-reminder-v1';
  const DEFAULT_TIME = '09:00';
  const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  let initialized = false;
  let queue = Promise.resolve();
  let requested = false;

  function read() {
    const fallback = { optedIn: false, localTime: DEFAULT_TIME };
    if (!NativeShell.enabled) return fallback;
    try {
      const raw = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (!raw || raw.v !== 1) return fallback;
      const localTime = validTime(raw.localTime) ? raw.localTime : DEFAULT_TIME;
      return { optedIn: raw.optedIn === true && validTime(raw.localTime), localTime };
    } catch { return fallback; }
  }

  function persist(next) {
    if (!NativeShell.enabled || !validTime(next.localTime)) return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({
        v: 1, optedIn: next.optedIn === true, localTime: next.localTime
      }));
      return true;
    } catch { return false; }
  }

  function earliestDueAt(now = Date.now()) {
    if (!NativeShell.enabled || App.loading || App.workspaceBlocked) return null;
    let due = Infinity;
    for (const { c } of Model.cardRefs()) {
      if (!c || c.st === 0 || c.susp) continue;
      // A temporarily buried card becomes eligible at its unbury time;
      // excluding it forever would miss tomorrow's due reminder.
      const at = Model.isBuried(c, now) ? Math.max(c.due, c.bury) : c.due;
      if (Number.isSafeInteger(at) && at > 0) due = Math.min(due, at);
    }
    return Number.isFinite(due) ? due : null;
  }

  // Serialize OS writes and re-read preferences/workspace at execution time.
  // An in-flight enable can never reschedule after a later opt-out.
  function reconcile() {
    if (!NativeShell.enabled) return Promise.resolve({ scheduled: false });
    queue = queue.catch(() => {}).then(() => {
      const pref = read();
      const now = Date.now();
      const due = earliestDueAt(now);
      return NativeShell.reconcileDueReminder({
        optedIn: pref.optedIn && due !== null,
        localTime: pref.localTime,
        earliestDueAt: due,
        now
      });
    });
    return queue;
  }

  async function enable(localTime) {
    if (!NativeShell.enabled || !validTime(localTime)) return { ok: false, reason: 'unavailable' };
    const existing = await NativeShell.checkDueReminderPermission();
    if (existing === 'unavailable') return { ok: false, reason: 'unavailable' };
    // This method is called ONLY by the Settings button click handler.
    const permission = existing === 'prompt'
      ? await NativeShell.requestDueReminderPermission() : existing;
    if (permission !== 'granted') return { ok: false, reason: 'denied' };
    if (!persist({ optedIn: true, localTime })) return { ok: false, reason: 'storage' };
    try {
      const result = await reconcile();
      return { ok: true, result };
    } catch {
      return { ok: true, error: 'Reminder scheduling unavailable; check again in Settings.' };
    }
  }

  async function disable() {
    const pref = read();
    const saved = persist({ optedIn: false, localTime: pref.localTime });
    if (!saved) {
      // Cancel any OS alarm even when storage is unavailable. Never claim the
      // preference will remain off after a restart if it could not be saved.
      try { await NativeShell.reconcileDueReminder({ optedIn: false }); } catch {}
      return false;
    }
    await reconcile();
    return true;
  }

  function saveTime(localTime) {
    if (!validTime(localTime)) return false;
    return persist({ ...read(), localTime });
  }

  function requestReconcile() {
    if (!NativeShell.enabled || requested) return;
    requested = true;
    Promise.resolve().then(() => {
      requested = false;
      reconcile().catch(() => { /* UI reports errors on explicit actions */ });
    });
  }

  function onTap(route) {
    if (route !== 'review' || !read().optedIn || App.loading ||
        App.workspaceBlocked || !App.workspaceIdle()) return;
    const due = Model.counts(null);
    if (due.learn + due.review > 0) App.startSession(new Session({}));
    else App.go('home');
  }

  function init() {
    if (!NativeShell.enabled || initialized) return;
    initialized = true;
    NativeShell.onDueReminderTap(onTap);
    Model.onChange(requestReconcile);
    window.addEventListener('focus', requestReconcile);
    window.addEventListener('online', requestReconcile);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) requestReconcile();
    });
    requestReconcile(); // Also cancel any stale alarm when default-off.
  }

  return { read, enable, disable, saveTime, reconcile, earliestDueAt, init };
})();

/* KNOWLEDGE-01 K3a: local, unaccepted account-context draft coordinator.
   This is not the cloud knowledge outbox and never approves tutor proposals. */
const KnowledgeDraftEditor = (() => {
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  function create() {
    let current = null;
    let busy = false;
    function scope() {
      const ownerId = LemmaAccount.user?.id;
      const handle = LemmaSync.accountHandle();
      if (!ownerId || Store.mode !== 'account' || App.workspaceBlocked ||
          !handle || handle.userId !== ownerId)
        throw new Error('Use your signed-in account workspace to edit study context drafts');
      return { ownerId, handle, generation: App.workspaceRevision };
    }
    function unchanged(before) {
      const after = scope();
      if (after.ownerId !== before.ownerId || after.handle !== before.handle ||
          after.generation !== before.generation)
        throw new Error('Account or workspace changed; previous draft remains private');
    }
    function start() {
      scope();
      if (busy) throw new Error('Wait for the current draft operation');
      const id = window.crypto?.randomUUID?.();
      if (!uuid.test(id || '')) throw new Error('Secure context ID generation unavailable');
      current = { contextId: id, localRevision: 0, expectedRevision: 0,
        title: '', markdown: '', payload: { schema_version: 1, summary: '', goals: [] },
        authorKind: 'student', status: 'unsaved' };
      return current;
    }
    async function open(contextId) {
      const before = scope();
      if (busy) throw new Error('Wait for the current draft operation');
      if (typeof contextId !== 'string' || !uuid.test(contextId.trim()))
        throw new Error('Enter a valid context ID');
      busy = true;
      try {
        const row = await LemmaCloudBridge.readKnowledgeDraft(contextId.trim().toLowerCase());
        unchanged(before);
        if (!row) throw new Error('No saved draft for this ID in this account cache');
        current = row;
        return row;
      } finally { busy = false; }
    }
    async function save({ title, markdown, summary, goals }) {
      const before = scope();
      if (busy) throw new Error('Wait for the current draft operation');
      const original = current;
      if (!original || !['unsaved', 'draft'].includes(original.status))
        throw new Error('This draft is unavailable or locked after approval');
      const cleanTitle = String(title || '').trim();
      const cleanMarkdown = String(markdown || '');
      const cleanSummary = String(summary || '');
      const cleanGoals = String(goals || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const bytes = text => new TextEncoder().encode(text).byteLength;
      if (!cleanTitle || bytes(cleanTitle) > 512 ||
          bytes(cleanMarkdown) > 65536 || bytes(cleanSummary) > 4096 ||
          cleanGoals.length > 16 || cleanGoals.some(g => bytes(g) > 512))
        throw new Error('Title, summary, goals or Markdown exceeds the private draft limits');
      const payload = { ...original.payload, schema_version: 1,
        summary: cleanSummary, goals: cleanGoals };
      busy = true;
      try {
        const row = await LemmaCloudBridge.saveKnowledgeDraft({
          contextId: original.contextId,
          expectedLocalRevision: original.localRevision,
          expectedRevision: original.expectedRevision,
          title: cleanTitle, markdown: cleanMarkdown, payload,
          authorKind: original.authorKind
        });
        unchanged(before);
        if (current !== original) throw new Error('Draft selection changed during save');
        current = row;
        return row;
      } finally { busy = false; }
    }
    // Read the exact persisted draft before presenting an approval choice.
    // No remote write or approval occurs on this read-only review path.
    async function reviewSaved() {
      const before=scope();
      if (busy) throw new Error('Wait for the current draft operation');
      const original=current;
      if (!original || original.status!=='draft')
        throw new Error('Save an unapproved context draft before reviewing it');
      busy=true;
      try {
        const saved=await LemmaCloudBridge.readKnowledgeDraft(original.contextId);
        unchanged(before);
        if (current!==original || !saved || saved.status!=='draft' ||
            saved.contextId!==original.contextId ||
            saved.localRevision!==original.localRevision ||
            JSON.stringify(saved)!==JSON.stringify(original))
          throw new Error('Saved context changed; reopen and review again');
        return structuredClone(saved);
      } finally {busy=false;}
    }
    // Only an explicit student click after reviewing the exact saved snapshot
    // may stage immutable approval. IndexedDB checks the revision atomically.
    async function approveReviewed(reviewed) {
      const before=scope();
      if (busy) throw new Error('Wait for the current draft operation');
      const original=current;
      if (!reviewed || !original || original.status!=='draft' ||
          reviewed.contextId!==original.contextId ||
          reviewed.localRevision!==original.localRevision ||
          JSON.stringify(reviewed)!==JSON.stringify(original))
        throw new Error('Context changed; review the saved draft again');
      busy=true;
      try {
        const row=await LemmaCloudBridge.approveKnowledgeDraft(
          original.contextId,original.localRevision,true);
        unchanged(before);
        if (current!==original || row?.status!=='approved_pending' ||
            row.contextId!==original.contextId ||
            row.approvedFromLocalRevision!==original.localRevision ||
            !uuid.test(row.requestId||''))
          throw new Error('Approved intent changed; reopen the context');
        current=row;
        return row;
      } finally {busy=false;}
    }
    // Publication is another separate student gesture. A's bridge retains
    // the same request ID on timeout, offline return or stale revision.
    async function submitApproved() {
      const before=scope();
      if (busy) throw new Error('Wait for the current draft operation');
      const original=current;
      if (!original || original.status!=='approved_pending')
        throw new Error('Approve a reviewed context before publication');
      busy=true;
      try {
        const receipt=await LemmaCloudBridge.submitApprovedKnowledgeDraft(original.contextId);
        unchanged(before);
        if (current!==original || !receipt ||
            !['confirmed','queued','conflict'].includes(receipt.status) ||
            receipt.requestId!==original.requestId)
          throw new Error('Knowledge publication receipt changed; reopen context');
        if (receipt.status==='confirmed') {
          if (!Number.isSafeInteger(receipt.revision) || receipt.revision<=original.expectedRevision)
            throw new Error('Invalid accepted context revision');
          current={...original,status:'published',publishedRevision:receipt.revision};
        } else if (receipt.status==='conflict') {
          const latest=await LemmaCloudBridge.readKnowledgeDraft(original.contextId);
          unchanged(before);
          if(current!==original || latest?.status!=='needs_review' ||
              latest.contextId!==original.contextId ||
              latest.requestId!==original.requestId)
            throw new Error('Conflict changed; reopen context before comparing');
          current=latest;
        }
        return receipt;
      } finally {busy=false;}
    }
    // A comparison is requested by the student, never by render/reconnect.
    async function compareConflict() {
      const before = scope();
      if (busy) throw new Error('Wait for the current draft operation');
      const original = current;
      if (!original || original.status !== 'needs_review' || !uuid.test(original.requestId || ''))
        throw new Error('Open a conflicting approved intent before comparing');
      busy = true;
      try {
        const packet = await LemmaCloudBridge.inspectKnowledgeConflict(original.contextId);
        unchanged(before);
        if (current !== original || packet?.local?.contextId !== original.contextId ||
            packet.local.localRevision !== original.localRevision ||
            packet.local.requestId !== original.requestId ||
            !Number.isSafeInteger(packet.accepted?.revision) ||
            packet.accepted.revision <= original.expectedRevision)
          throw new Error('Knowledge conflict changed; compare again');
        return packet;
      } finally { busy = false; }
    }
    // Only a second explicit student gesture can reopen a compared conflict.
    // The A-owned API archives the original and returns an UNAPPROVED local draft.
    async function reopenConflict(packet) {
      const before = scope();
      if (busy) throw new Error('Wait for the current draft operation');
      const original = current;
      if (!original || original.status !== 'needs_review' ||
          packet?.local?.contextId !== original.contextId ||
          packet.local.localRevision !== original.localRevision ||
          packet.local.requestId !== original.requestId ||
          !Number.isSafeInteger(packet.accepted?.revision) ||
          packet.accepted.revision <= original.expectedRevision)
        throw new Error('Knowledge conflict changed; compare again');
      busy = true;
      try {
        const row = await LemmaCloudBridge.reopenReviewedKnowledgeConflict(
          original.contextId, original.localRevision, original.requestId,
          packet.accepted.revision, true);
        unchanged(before);
        if (current !== original || !row || row.status !== 'draft' ||
            row.contextId !== original.contextId || row.requestId ||
            row.expectedRevision !== packet.accepted.revision ||
            row.localRevision !== original.localRevision + 1)
          throw new Error('Knowledge conflict changed; reopen saved draft by ID');
        current = row;
        return row;
      } finally { busy = false; }
    }
    return { start, open, save, reviewSaved, approveReviewed, submitApproved,
      compareConflict, reopenConflict, current: () => current };
  }
  return { create };
})();

const SettingsView = (() => {
  // RELEASE-01: keep recovery UI unavailable on Pages until the exact
  // account-restore migration and live owner-isolation gate are verified.
  // Browser acceptance enables this only in its synthetic test bundle.
  const ACCOUNT_RECOVERY_READY = false;
  let optResult = null;
  let optResultGeneration = -1;
  let sweep = null;
  let sweepGeneration = -1;
  // A recovery preflight pauses this tab's account sync. Retain only the owner
  // marker across Settings rerenders, never the private backup or consent.
  let pausedRecoveryOwner = null;

  function numField(id, label, key, opts = {}) {
    const input = h('input', { id, class: 'input input-num', type: 'number', inputmode: 'numeric', min: opts.min, max: opts.max, step: opts.step || 1, value: Model.settings[key] });
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) { input.value = Model.settings[key]; return; }
      Model.setSettings({ [key]: v });
      input.value = Model.settings[key];
    });
    return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label, opts.help ? h('span', { class: 'setting-help', text: opts.help }) : null), input);
  }
  function toggleField(id, label, key, help) {
    const input = h('input', { id, type: 'checkbox', class: 'switch', checked: !!Model.settings[key] });
    input.addEventListener('change', () => Model.setSettings({ [key]: input.checked }));
    return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label, help ? h('span', { class: 'setting-help', text: help }) : null), input);
  }
  function selectField(id, label, key, options, help) {
    const sel = h('select', { id, class: 'input select' }, options.map(([v, l]) => h('option', { value: v, selected: String(Model.settings[key]) === String(v), text: l })));
    sel.addEventListener('change', () => Model.setSettings({ [key]: isNaN(+sel.value) || sel.value === '' ? sel.value : +sel.value }));
    return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label, help ? h('span', { class: 'setting-help', text: help }) : null), sel);
  }
  function stepsField(id, label, key, help) {
    const input = h('input', { id, class: 'input input-steps', value: Model.settings[key], autocomplete: 'off', spellcheck: 'false' });
    input.addEventListener('change', () => {
      const parsed = FSRS.parseSteps(input.value);
      if (parsed === null) { toast('Use values like “1m 10m” or “10m 1h”.', { kind: 'error' }); input.value = Model.settings[key]; return; }
      Model.setSettings({ [key]: FSRS.formatSteps(parsed) });
      input.value = Model.settings[key];
    });
    return h('div', { class: 'setting' }, h('label', { for: id, class: 'setting-label' }, label, help ? h('span', { class: 'setting-help', text: help }) : null), input);
  }
  const section = (id, title, intro, ...kids) => h('section', { class: 'panel settings-sec', id }, h('h2', { class: 'section-title', text: title }), intro ? h('p', { class: 'muted small sec-intro', text: intro }) : null, ...kids);

  // Read-only backup can be offered before the separate restore gate opens.
  function accountBackupSection(){
    const ownerId=LemmaAccount.user.id,client=LemmaAccount.client;
    const generation=App.workspaceRevision;
    const status=h('p',{class:'muted small',role:'status','aria-live':'polite'});
    const save=h('button',{class:'btn btn-sm',type:'button',text:'Download account backup'});
    const root=section('set-account-backup','Account backup',
      'Download a private backup of your account and unsynced work. Keep this file private. Account restore is not yet available.',
      h('div',{class:'btn-row'},save),status);
    const check=()=>{
      if(!root.isConnected||LemmaAccount.user?.id!==ownerId||LemmaAccount.client!==client||
         App.workspaceRevision!==generation||App.workspaceBlocked)
        throw new Error('Account or workspace changed; reopen backup.');
    };
    save.onclick=async()=>{
      if(save.disabled)return;save.disabled=true;
      try {
        check();const backup=await LemmaCloudBridge.captureReadOnlyRecoveryPair(true);check();
        await LemmaCloudBridge.verifyReadOnlyRecoveryPair(backup,ownerId);check();
        const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json;charset=utf-8'}));
        const link=h('a',{href:url,download:'lemma-account-backup-'+new Date().toISOString().slice(0,10)+'.json',hidden:true});
        document.body.appendChild(link);
        try {check();link.click();status.textContent='Backup download started. Keep the file private and check that it saved.';}
        finally {link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
      } catch(err) {if(root.isConnected)status.textContent='Backup: '+(err.message||'Unavailable.');}
      finally {if(root.isConnected)save.disabled=false;}
    };
    return root;
  }

  function accountRecoverySection(){
    const ownerId=LemmaAccount.user.id,client=LemmaAccount.client;
    const generation=App.workspaceRevision;
    const status=h('p',{class:'muted small',role:'status','aria-live':'polite'});
    const save=h('button',{class:'btn btn-sm',type:'button',text:'Download account backup'});
    const file=h('input',{id:'account-recovery-file',class:'input',type:'file',accept:'.json,application/json'});
    const inspect=h('button',{class:'btn btn-sm',type:'button',text:'Check restore'});
    const consent=h('input',{id:'account-recovery-consent',type:'checkbox'});
    const restore=h('button',{class:'btn btn-primary btn-sm',type:'button',text:'Restore account backup'});
    const cancel=h('button',{class:'btn btn-sm',type:'button',text:'Clear selection'});
    const resume=h('button',{class:'btn btn-sm',type:'button',text:'Resume account sync',hidden:true});
    let pair=null,requestId=null,validated=false,busy=false,ticket=0;
    const root=section('set-account-recovery','Account backup and recovery',
      'Download a private backup of your account and unsynced work. Keep this file private. Restore uses the same account and requires its existing work to be empty; your separate device cards stay intact.',
      h('div',{class:'btn-row'},save),
      h('div',{class:'setting setting-col'},h('label',{for:file.id,class:'setting-label',text:'Choose an account backup'}),file),
      h('div',{class:'btn-row'},inspect,cancel),
      h('label',{class:'conflict-confirm'},consent,h('span',{text:'I want to restore this backup to this same account and resume its queued edits.'})),
      h('div',{class:'btn-row'},restore,resume),status);
    const stopped=()=>typeof LemmaSync.accountHandle==='function' && !LemmaSync.accountHandle();
    resume.hidden=pausedRecoveryOwner!==ownerId||!stopped();
    if(!resume.hidden)status.textContent='Account sync is paused after recovery. Resume account sync or choose the backup again.';
    const markPaused=()=>{pausedRecoveryOwner=ownerId;resume.hidden=false;};
    const clearPaused=()=>{if(pausedRecoveryOwner===ownerId)pausedRecoveryOwner=null;resume.hidden=true;};
    const current=()=>root.isConnected&&LemmaAccount.user?.id===ownerId&&
      LemmaAccount.client===client&&App.workspaceRevision===generation&&!App.workspaceBlocked;
    const check=()=>{if(!current())throw new Error('Account or workspace changed; reopen recovery.');};
    const update=()=>{
      save.disabled=busy;file.disabled=busy;cancel.disabled=busy;
      inspect.disabled=busy||!pair||Store.mode!=='local';
      consent.disabled=busy||!validated;
      restore.disabled=busy||!validated||!consent.checked||Store.mode!=='local';
      resume.disabled=busy;
    };
    const run=async action=>{
      if(busy)return;busy=true;update();
      try {check();await action();}
      catch(err){if(current())status.textContent='Recovery: '+(err.message||'Unavailable. Keep your backup and retry.');}
      finally{busy=false;if(current())update();}
    };
    save.onclick=()=>run(async()=>{
      const backup=await LemmaCloudBridge.captureReadOnlyRecoveryPair(true);check();
      const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json;charset=utf-8'}));
      const link=h('a',{href:url,download:'lemma-account-backup-'+new Date().toISOString().slice(0,10)+'.json',hidden:true});
      document.body.appendChild(link);
      try{check();link.click();status.textContent='Backup download started. Keep the file private and check that it saved.';}
      finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    });
    file.onchange=async()=>{
      const selected=file.files?.[0],ownTicket=++ticket;
      pair=null;requestId=null;validated=false;consent.checked=false;update();
      if(!selected)return;
      await run(async()=>{
        if(selected.size>130*1024*1024)throw new Error('Backup file exceeds the recovery size limit.');
        const parsed=JSON.parse(await selected.text());check();
        if(ownTicket!==ticket)return;
        const summary=await LemmaCloudBridge.verifyReadOnlyRecoveryPair(parsed,ownerId);check();
        if(ownTicket!==ticket)return;
        // Retain only a random retry key and digest, never private study data,
        // in browser preferences. Selecting the SAME file after reload reuses it.
        const key='lemma-recovery-request:'+ownerId+':'+summary.sha256;
        const prior=localStorage.getItem(key);
        requestId=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(prior||'')?prior:crypto.randomUUID();
        localStorage.setItem(key,requestId);pair=parsed;
        status.textContent=summary.serverRows+' account records and '+summary.localRows+
          ' saved device records. Account backup: '+new Date(parsed.server.exportedAt).toLocaleString()+
          '. Device work was captured separately.'+
          (Store.mode==='local'?' Check restore before continuing.':' Return to the device workspace above before restoring.');
      });
    };
    inspect.onclick=()=>run(async()=>{
      check();if(!pair)throw new Error('Choose a backup first.');
      markPaused();
      await LemmaCloudBridge.restoreRecoveryPair(pair,{requestId,studentConfirmed:true,dryRun:true});check();
      validated=true;
      status.textContent='Backup checked. Account sync is paused. Choose Restore account backup to continue, or Resume account sync to leave recovery.';
    });
    consent.onchange=update;
    restore.onclick=()=>run(async()=>{
      if(!pair||!validated||!consent.checked)throw new Error('Check the backup and confirm restore first.');
      const accepted=await confirmDialog({title:'Restore this account backup?',
        message:'Restore the account records and unsynced work in this file, then resume its queued edits. Existing account work will never be replaced. Your separate device cards stay intact.',
        confirmLabel:'Restore and resume edits'});
      check();if(!accepted)return;
      markPaused();
      await LemmaCloudBridge.restoreRecoveryPair(pair,{requestId,studentConfirmed:true,dryRun:false,resumeSync:true});check();
      validated=false;consent.checked=false;clearPaused();
      status.textContent='Account backup restored. Queued edits can now sync. Use the account workspace above when ready.';
    });
    cancel.onclick=()=>{
      ++ticket;pair=null;requestId=null;validated=false;consent.checked=false;file.value='';
      status.textContent=resume.hidden?'Backup selection cleared.':'Selection cleared. Account sync is still paused; choose Resume account sync to leave recovery.';
      update();
    };
    resume.onclick=()=>run(async()=>{
      await LemmaSync.attach(LemmaAccount.user);check();validated=false;consent.checked=false;clearPaused();
      status.textContent='Account sync resumed. Check restore again before restoring a backup.';
    });
    update();return root;
  }

  function render(params = {}) {
    const s = Model.settings;
    const page = h('div', { class: 'page settings' }, h('div', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Settings' })));

    page.append(section('set-daily', 'Daily limits', null,
      numField('s-new', 'New cards per day', 'newPerDay', { min: 0, max: 9999 }),
      numField('s-rev', 'Maximum reviews per day', 'reviewsPerDay', { min: 0, max: 99999, help: 'Extra reviews wait until tomorrow' }),
      selectField('s-roll', 'A new day starts at', 'rollover', Array.from({ length: 24 }, (_, i) => [i, new Date(2020, 0, 1, i).toLocaleTimeString(undefined, { hour: 'numeric' })]), 'Late-night study counts toward the previous day.')));

    // memory model
    const retOut = h('output', { class: 'ret-val', for: 's-ret', text: fmtPct(s.retention) });
    const retIn = h('input', { id: 's-ret', type: 'range', class: 'range', min: 0.7, max: 0.97, step: 0.01, value: s.retention });
    retIn.addEventListener('input', () => { retOut.textContent = fmtPct(+retIn.value); drawSweepMarker(); });
    retIn.addEventListener('change', () => Model.setSettings({ retention: +retIn.value }));
    const sweepHost = h('div', { class: 'sweep' });
    const sweepBtn = h('button', { class: 'btn btn-sm', type: 'button', html: icon('chart', 16) + '<span>Estimate workload</span>', onclick: runSweep });
    function drawSweep() {
      fill(sweepHost);
      if (!sweep || sweepGeneration !== App.workspaceRevision || App.workspaceBlocked) return;
      const cur = +retIn.value;
      const at = sweep.find((x) => Math.abs(x.retention - cur) < 0.005) || sweep[0];
      const best = sweep.reduce((a, b) => (b.memorized / (b.reviewsPerDay * 365 + b.learned) > a.memorized / (a.reviewsPerDay * 365 + a.learned) ? b : a));
      sweepHost.append(h('p', { class: 'sweep-sum' }, `At ${fmtPct(cur)}: about `, h('b', { text: fmtInt(at.reviewsPerDay) + ' reviews a day' }), ' and ', h('b', { text: fmtInt(at.memorized) + ' cards remembered' }), ` after a year of ${Model.settings.newPerDay || 20} new cards a day. The most knowledge per review is near ${fmtPct(best.retention)}.`));
      const xT = [0.7, 0.8, 0.9, 0.97];
      sweepHost.append(h('div', { class: 'sweep-charts' },
        Charts.line({ title: 'Reviews per day', points: sweep.map((x) => ({ x: x.retention, y: x.reviewsPerDay, tip: 'Retention ' + fmtPct(x.retention) })), xMin: 0.7, xMax: 0.97, yMin: 0, yMax: Charts.niceMax(Math.max(...sweep.map((x) => x.reviewsPerDay))), yTicks: null, xTicks: xT, xFmt: (v) => fmtPct(v), yFmt: (v) => fmtInt(v), markers: [{ x: at.retention, y: at.reviewsPerDay, cls: 'c-dot-now' }], height: 150,
          table: { columns: ['Retention', 'Reviews/day'], rows: sweep.map((x) => [fmtPct(x.retention), x.reviewsPerDay.toFixed(1)]) } }),
        Charts.line({ title: 'Cards remembered after a year', points: sweep.map((x) => ({ x: x.retention, y: x.memorized, tip: 'Retention ' + fmtPct(x.retention) })), xMin: 0.7, xMax: 0.97, yMin: 0, yMax: Charts.niceMax(Math.max(...sweep.map((x) => x.learned))), xTicks: xT, xFmt: (v) => fmtPct(v), yFmt: (v) => fmtInt(v), markers: [{ x: at.retention, y: at.memorized, cls: 'c-dot-now' }], height: 150,
          table: { columns: ['Retention', 'Remembered'], rows: sweep.map((x) => [fmtPct(x.retention), fmtInt(x.memorized)]) } })));
    }
    const drawSweepMarker = debounce(drawSweep, 60);
    async function runSweep() {
      const generation = App.workspaceRevision;
      sweepBtn.disabled = true;
      fill(sweepHost, h('p', { class: 'muted small thinking', text: 'Simulating a year of reviews at each retention…' }));
      try {
        const probs = ratingProbs();
        const deckSize = clampN(Math.max(Model.cardRefs().length, (Model.settings.newPerDay || 20) * 120), 300, 4000);
        const result = await Jobs.exec('sweep', { w: Model.settings.w, opts: { from: 0.7, to: 0.97, stepSize: 0.01, days: 365, newPerDay: Model.settings.newPerDay || 20, deckSize, maxIvl: Model.settings.maxIvl, firstProbs: probs.first, recallProbs: probs.recall } });
        if (generation !== App.workspaceRevision || App.workspaceBlocked) return;
        sweep = result;
        sweepGeneration = generation;
        drawSweep();
      } catch (e) {
        if (generation === App.workspaceRevision && !App.workspaceBlocked)
          fill(sweepHost, h('p', { class: 'ai-error', text: 'The simulation failed: ' + e.message }));
      }
      if (generation === App.workspaceRevision) sweepBtn.disabled = false;
    }
    page.append(section('set-fsrs', 'Memory model', 'FSRS-6 shows each card again when its recall falls to your target.',
      h('div', { class: 'setting setting-col' },
        h('div', { class: 'setting-row' }, h('label', { for: 's-ret', class: 'setting-label' }, 'Desired retention', h('span', { class: 'setting-help', text: 'Higher = fewer lapses, more reviews' })), retOut),
        retIn,
        h('div', { class: 'sweep-head' }, sweepBtn),
        sweepHost),
      stepsField('s-learn', 'Learning steps', 'learnSteps', 'e.g. 1m 10m'),
      stepsField('s-relearn', 'Relearning steps', 'relearnSteps', 'e.g. 10m'),
      numField('s-max', 'Maximum interval (days)', 'maxIvl', { min: 1, max: 36500 }),
      toggleField('s-fuzz', 'Spread out intervals', 'fuzz', 'Small random spread'),
      toggleField('s-lb', 'Balance daily load', 'loadBalance', 'Prefer lighter days')));
    if (sweep && sweepGeneration === App.workspaceRevision && !App.workspaceBlocked) setTimeout(drawSweep, 0);

    page.append(optimizerSection());

    page.append(section('set-study', 'Study', null,
      selectField('s-order', 'Review order', 'reviewOrder', [['retrievability', 'Weakest memories first'], ['due', 'Oldest due first'], ['random', 'Random']]),
      selectField('s-neworder', 'New card order', 'newOrder', [['prereq', 'Prerequisites first, then oldest'], ['created', 'Oldest first'], ['random', 'Random']]),
      selectField('s-mix', 'New cards appear', 'newMix', [['mix', 'Mixed in with reviews'], ['after', 'After reviews'], ['before', 'Before reviews']]),
      toggleField('s-gate', 'Wait for prerequisites', 'gatePrereqs', 'New cards wait for what they build on'),
      toggleField('s-refresh', 'Refresh prerequisites after a lapse', 'refreshPrereqs', 'Missed card → review its basics'),
      toggleField('s-bury', 'One card per note per day', 'burySiblings', 'Siblings wait until tomorrow'),
      numField('s-ahead', 'Learn ahead limit (minutes)', 'learnAhead', { min: 0, max: 120, help: 'Show learning cards early' }),
      numField('s-leech', 'Leech threshold (lapses)', 'leechThreshold', { min: 0, max: 99 }),
      selectField('s-leechact', 'When a card becomes a leech', 'leechAction', [['tag', 'Tag it “leech”'], ['suspend', 'Tag and suspend it']]),
      toggleField('s-recall', 'Show recall ring', 'showRecall', 'Predicted recall under review cards')));

    // Native reminders are opt-in on this installation, not a synced profile
    // setting. Merely having due cards or OS permission never enables them.
    if (NativeShell.enabled) {
      const pref = ReminderSettings.read();
      const reminderTime = h('input', { id: 's-reminder-time', type: 'time',
        class: 'input reminder-time', value: pref.localTime });
      const reminderButton = h('button', { id: 's-reminder-toggle',
        type: 'button', class: 'btn btn-sm', text: pref.optedIn ? 'Turn off reminders' : 'Enable reminders' });
      const reminderStatus = h('p', { id: 's-reminder-status', class: 'muted small',
        role: 'status', 'aria-live': 'polite', text: 'Checking Android reminder permission…' });
      async function showReminderStatus(notice = '') {
        const state = ReminderSettings.read();
        reminderButton.textContent = state.optedIn ? 'Turn off reminders' : 'Enable reminders';
        reminderTime.value = state.localTime;
        let permission = 'unavailable';
        try { permission = await NativeShell.checkDueReminderPermission(); }
        catch { permission = 'unavailable'; }
        if (!reminderStatus.isConnected) return;
        const permissionText = permission === 'granted' ? 'Android permission granted.' :
          permission === 'denied' ? 'Android permission denied. Change it in Android app settings.' :
          permission === 'prompt' ? 'Android permission not yet granted.' :
          'Native notification permission unavailable.';
        const due = ReminderSettings.earliestDueAt();
        const stateText = !state.optedIn ? 'Reminders off.' :
          permission !== 'granted' ? 'Reminders enabled in Lemma, but no alert can be delivered.' :
          due === null ? 'Reminders enabled; no studied cards currently have a due time.' :
          'Reminders enabled for due reviews at the selected local time.';
        reminderStatus.textContent = (notice ? notice + ' ' : '') + stateText + ' ' + permissionText;
      }
      reminderButton.addEventListener('click', async () => {
        reminderButton.disabled = true;
        let notice = '';
        try {
          if (ReminderSettings.read().optedIn) {
            const saved = await ReminderSettings.disable();
            if (!saved) notice = 'Could not save opt-out. Android notification was cancelled; check storage settings.';
          } else {
            const result = await ReminderSettings.enable(reminderTime.value);
            if (!result.ok) notice = result.reason === 'denied'
              ? 'Permission was not granted; reminders remain off.' :
              result.reason === 'storage' ? 'Could not save consent; reminders remain off.' :
              'Reminders unavailable on this Android installation.';
            else if (result.error) notice = result.error;
          }
        } catch { notice = 'Could not update Android reminders. Please try again.'; }
        finally {
          reminderButton.disabled = false;
          await showReminderStatus(notice);
        }
      });
      reminderTime.addEventListener('change', async () => {
        const saved = ReminderSettings.saveTime(reminderTime.value);
        if (!saved) {
          await showReminderStatus('Enter a valid time; the previous choice was kept.');
          return;
        }
        let notice = '';
        try { await ReminderSettings.reconcile(); }
        catch { notice = 'Could not update the scheduled reminder.'; }
        await showReminderStatus(notice);
      });
      page.append(section('set-reminders', 'Android review reminders',
        'Optional and quiet. Only this Android installation is affected; no cards or account details appear in notifications.',
        h('div', { class: 'setting reminder-control' },
          h('label', { for: 's-reminder-time', class: 'setting-label' }, 'Remind me at',
            h('span', { class: 'setting-help', text: 'Local device time, when a studied card is due' })),
          reminderTime),
        h('div', { class: 'btn-row reminder-control' }, reminderButton),
        reminderStatus));
      // Permission can be revoked in Android Settings while Lemma is paused.
      // Refresh on return without requesting it again or retaining dead views.
      const onReminderFocus = () => {
        if (!page.isConnected) {
          window.removeEventListener('focus', onReminderFocus);
          return;
        }
        showReminderStatus();
      };
      window.addEventListener('focus', onReminderFocus);
      showReminderStatus();
    }

    // math
    const pre = h('textarea', { id: 's-preamble', class: 'input code-input', rows: 8, spellcheck: 'false' });
    pre.value = s.preamble;
    const preMsg = h('p', { class: 'small', role: 'status' });
    const preTest = h('div', { class: 'prose preamble-test' });
    const checkPre = () => {
      Model.setSettings({ preamble: pre.value });
      const res = Render.setPreamble(pre.value);
      preMsg.className = 'small ' + (res.ok ? 'muted' : 'ai-error');
      preMsg.textContent = res.ok ? `${plural(res.count, 'macro')} loaded.` : res.errors.map((e) => `Line ${e.line}: ${e.message}`).join(' · ');
      preTest.innerHTML = Render.render('$\\R^n,\\ \\norm{x},\\ \\tr(A),\\ \\abs{z},\\ \\inner{u}{v}$');
    };
    pre.addEventListener('change', checkPre);
    const fontSel = h('input', { id: 's-font', type: 'range', class: 'range', min: 13, max: 26, step: 1, value: s.cardFont });
    const fontOut = h('output', { class: 'ret-val', for: 's-font', text: s.cardFont + ' px' });
    fontSel.addEventListener('input', () => { fontOut.textContent = fontSel.value + ' px'; });
    fontSel.addEventListener('change', () => Model.setSettings({ cardFont: +fontSel.value }));
    page.append(section('set-math', 'Math', '\\newcommand, \\def or \\DeclareMathOperator, one per line.',
      h('div', { class: 'setting setting-col' }, h('label', { for: 's-preamble', class: 'setting-label', text: 'LaTeX macros' }), pre, preMsg, preTest),
      h('div', { class: 'setting setting-col' }, h('div', { class: 'setting-row' }, h('label', { for: 's-font', class: 'setting-label', text: 'Card text size' }), fontOut), fontSel)));
    setTimeout(checkPre, 0);

    if (AI.available()) {
      page.append(section('set-ai', 'Claude', 'Uses your Claude account, only when you tap a Claude button.',
        selectField('s-tier', 'Model for Claude features', 'aiTier', [['quick', 'Fast'], ['default', 'Balanced'], ['complex', 'Most capable (slower)']])));
    }

    // Cloud account is optional. Existing local cards are never migrated automatically.
    if (LemmaAccount.client) {
      const accountState = h('p', { class: 'muted small', role: 'status',
        text: LemmaAccount.user ? 'Signed in: ' + LemmaAccount.user.email + (Store.mode === 'account' ? '. Account workspace is active; edits save to this device and sync automatically.' : '. Your device workspace remains separate until you explicitly switch.') : 'Not signed in. Cards remain on this device.' });
      const google = h('button', { class: 'btn btn-primary btn-sm', type: 'button',
        text: 'Continue with Google' });
      const email = h('input', { type: 'email', class: 'input', placeholder: 'Email for sign-in link', autocomplete: 'email' });
      const send = h('button', { class: 'btn btn-sm', type: 'button', text: 'Send sign-in link' });
      const logout = h('button', { class: 'btn btn-sm', type: 'button', text: 'Sign out' });
      const message = h('p', { class: 'muted small', role: 'status',
        text: LemmaAccount.lastAuthError || '' });
      google.onclick = async () => {
        google.disabled = true;
        try { await LemmaAccount.signInWithGoogle(); }
        catch (err) { message.textContent = 'Google sign-in: ' + (err.message || err); }
        finally { google.disabled = false; }
      };
      send.onclick = async () => {
        send.disabled = true;
        try { await LemmaAccount.signIn(email.value.trim()); message.textContent = 'Check your email for a sign-in link.'; }
        catch (err) { message.textContent = 'Sign-in error: ' + err.message; }
        finally { send.disabled = false; }
      };
      logout.onclick = async () => {
        logout.disabled = true;
        try { await Store.whenSaved(); await LemmaAccount.signOut(); accountState.textContent = 'Signed out. Device cards remain available.'; App.refresh(); }
        catch (err) { message.textContent = 'Sign-out error: ' + err.message; }
        finally { logout.disabled = false; }
      };
      const upload = h('button', { class: 'btn btn-sm', type: 'button', text: 'Queue missing cards to account' });
      const download = h('button', { class: 'btn btn-sm', type: 'button', text: 'Copy missing cloud cards to this device' });
      const transfer = async (button, fn) => {
        button.disabled = true;
        try {
          const result = await fn();
          message.textContent = result.copied + ' cards copied; ' + result.skipped + ' skipped. This is a one-time copy, not continuous synchronization.';
          App.refresh();
        } catch (err) { message.textContent = 'Transfer error: ' + err.message; }
        finally { button.disabled = false; }
      };
      upload.onclick = async () => {
        const ok = await confirmDialog({
          title: 'Copy local cards into your account?',
          message: 'This copies missing card snapshots into your private account outbox. The original local cards remain untouched. Older review logs are copied as history, not independently reconstructed as cloud events. Conflicting card IDs are never overwritten. Export a backup first.',
          confirmLabel: 'Queue missing cards'
        });
        if (!ok) return;
        upload.disabled = true;
        try {
          const result = await LemmaSync.enrollMissingLocal();
          message.textContent = result.queued + ' card snapshots durably queued; ' +
            result.skipped + ' skipped. The account cache will attempt cloud delivery. ' +
            'Switch to the account workspace below for automatic sync of future edits.';
          showCache();
        } catch (err) {
          message.textContent = 'Account enrollment: ' + err.message;
        } finally { upload.disabled = false; }
      };
      download.onclick = () => transfer(download, () => LemmaCloudBridge.importMissing());
      const cacheState = h('p', { class: 'muted small', role: 'status' });
      const showCache = () => {
        const s = LemmaSync.status;
        cacheState.textContent = 'Private account cache: ' + s.phase +
          (s.pending ? ' · ' + s.pending + ' pending operations' : '') +
          (s.error ? ' · ' + s.error : '') +
          (Store.mode === 'account' ? '. Active account workspace.' : '. Separate from the device cards displayed by Lemma.');
      };
      const refreshCache = h('button', { class: 'btn btn-sm', type: 'button', text: 'Refresh account cache' });
      refreshCache.onclick = async () => {
        refreshCache.disabled = true;
        try { await LemmaSync.refresh(); showCache(); }
        catch (err) { message.textContent = 'Cache refresh: ' + err.message; showCache(); }
        finally { refreshCache.disabled = false; }
      };
      const comparison = h('p', { class: 'muted small', role: 'status' });
      const compare = h('button', { class: 'btn btn-sm', type: 'button',
        text: 'Compare local and account cards' });
      compare.onclick = async () => {
        compare.disabled = true;
        try {
          const r = await LemmaSync.compareLocal();
          comparison.textContent =
            r.identical + ' identical · ' + r.localOnly + ' only on device · ' +
            r.accountOnly + ' only in account · ' + r.divergent +
            ' same-ID conflicts · ' + r.cloudTombstone + ' account deletions · ' +
            r.dirtyAccount + ' pending account snapshots.' +
            (r.fresh ? '' : ' Account cache may be stale; refresh while online.');
          if (r.divergent || r.cloudTombstone) {
            comparison.textContent += ' Nothing was overwritten or merged.';
          }
        } catch (err) { comparison.textContent = 'Comparison unavailable: ' + err.message; }
        finally { compare.disabled = false; }
      };
      const backupCheck = h('input', {type:'checkbox'});
      const backupLabel = h('label', {class:'conflict-confirm'}, backupCheck,
        h('span', {text:'I have exported a backup of my device cards and reviewed the account comparison.'}));
      const useAccount = h('button', {class:'btn btn-primary btn-sm', type:'button',
        text:'Use account workspace'});
      const useDevice = h('button', {class:'btn btn-sm', type:'button',
        text:'Return to device workspace'});
      backupLabel.hidden = Store.mode === 'account';
      useAccount.hidden = Store.mode === 'account';
      useDevice.hidden = Store.mode !== 'account';
      useAccount.onclick = async () => {
        if (!backupCheck.checked) {
          message.textContent = 'Export a backup and check the acknowledgment before switching.';
          return;
        }
        const confirmed = await confirmDialog({
          title:'Switch to account workspace?',
          message:'Your device cards stay in their original storage. Account cards form a separate workspace; only changes made after switching sync automatically. Verify any missing cards are enrolled and cloud-confirmed first.',
          confirmLabel:'Use account workspace'
        });
        if (!confirmed) return;
        useAccount.disabled = true;
        try {
          if (navigator.onLine) await LemmaSync.refresh();
          await App.workspaceController.activate();
          App.rememberAccountWorkspace(LemmaAccount.user.id);
          App.go('home');
        } catch (err) {
          message.textContent = 'Cannot switch: ' + err.message;
          useAccount.disabled = false;
        }
      };
      useDevice.onclick = async () => {
        useDevice.disabled = true;
        try { await App.workspaceController.deactivate(); App.rememberAccountWorkspace(null); App.go('home'); }
        catch (err) { message.textContent = 'Cannot switch: ' + err.message; useDevice.disabled = false; }
      };
      showCache();
      page.append(section('set-cloud-account', 'Lemma account', 'Private account data syncs automatically after you explicitly enter the account workspace. Device cards are never enrolled by signing in.',
        accountState, h('div', { class: 'btn-row' }, google),
        h('div', { class: 'btn-row' }, email, send, logout),
        h('div', { class: 'btn-row' }, upload, download),
        cacheState, h('div', { class: 'btn-row' }, refreshCache, compare),
        comparison, backupLabel, h('div', {class:'btn-row'}, useAccount, useDevice),
        LemmaConflicts.mount(), message));
    }

    if (LemmaAccount.user && Store.mode === 'account' && !App.workspaceBlocked) {
      page.append(knowledgeDraftSection());
      page.append(acceptedRevisionSection());
    }

    if (ACCOUNT_RECOVERY_READY && LemmaAccount.user &&
        typeof LemmaCloudBridge.restoreRecoveryPair==='function')
      page.append(accountRecoverySection());
    else if (!ACCOUNT_RECOVERY_READY && LemmaAccount.user &&
        typeof LemmaCloudBridge.captureReadOnlyRecoveryPair==='function' &&
        typeof LemmaCloudBridge.verifyReadOnlyRecoveryPair==='function')
      page.append(accountBackupSection());

    // data
    const st = Store.status();
    const where = st.mode === 'cloud' ? 'Synced to your Claude account.' : st.mode === 'local' ? 'This browser only.' : 'Not saved here.';
    page.append(section('set-data', 'Your data', where,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', html: icon('download', 16) + '<span>Export</span>', onclick: () => ExportSheet.open() }),
        h('button', { class: 'btn', type: 'button', html: icon('upload', 16) + '<span>Import</span>', onclick: () => ImportSheet.open() }),
        h('button', { class: 'btn btn-ghost-danger', type: 'button', html: icon('trash', 16) + '<span>Delete all cards…</span>', onclick: deleteAll })),
      h('p', { class: 'muted small', text: `${plural(Model.notes.size, 'note')}, ${plural(Model.cardRefs().length, 'card')}, ${plural(Model.reviewCount(), 'review')} stored.` })));

    const howTo = AGENT_HELP;
    const howBox = h('textarea', { id: 's-agent', class: 'input code-input', rows: 6, readonly: true, 'aria-label': 'Instructions for Claude' });
    howBox.value = howTo;
    page.append(section('set-agent', 'Add cards from other chats', 'Paste with this page’s link into any chat; add your topic.',
      howBox, h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', html: icon('check', 16) + '<span>Copy instructions</span>', onclick: () => copyText(howTo, howBox) }))));

    page.append(section('set-keys', 'Keyboard', null, h('dl', { class: 'keys' },
      [['Space / Enter', 'Show answer, then Good (or the next proof step)'], ['1 2 3 4', 'Again, Hard, Good, Easy'], ['H', 'Next hint'], ['T', 'Type your answer'], ['D', 'Scratchpad'], ['E', 'Edit card'], ['U or Ctrl+Z', 'Undo last answer'], ['I', 'Card details'], ['N', 'New card (outside review)'], ['/', 'Search'], ['Ctrl+Enter', 'Save in the editor'], ['Ctrl+M', 'Wrap selection in $…$'], ['Ctrl+Shift+C', 'Make a cloze from the selection']]
        .map(([k, v]) => h('div', null, h('dt', null, h('kbd', { text: k })), h('dd', { text: v }))))));

    if (params.anchor) setTimeout(() => { const el = document.getElementById(params.anchor); if (el) el.scrollIntoView({ block: 'start' }); }, 30);
    return page;
  }

  /* K3c: an explicitly requested read-only, account-scoped accepted revision
     and six-at-a-time pinned source reader. No approval or write path. */
  function acceptedRevisionSection() {
    const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    const contextInput = h('input', { id: 's-accepted-id', class: 'input',
      type: 'text', spellcheck: 'false', autocomplete: 'off',
      placeholder: 'Accepted context UUID', 'aria-label': 'Accepted context ID' });
    const revisionInput = h('input', { id: 's-accepted-revision', class: 'input',
      type: 'number', min: 1, step: 1, inputmode: 'numeric',
      placeholder: 'Latest', 'aria-label': 'Accepted revision, optional' });
    const read = h('button', { id: 's-accepted-read', class: 'btn btn-primary btn-sm',
      type: 'button', text: 'Read accepted revision' });
    const status = h('p', { id: 's-accepted-status', class: 'muted small',
      role: 'status', 'aria-live': 'polite',
      text: 'No server read has been made. Enter a context ID and choose Read.' });
    const result = h('div', { id: 's-accepted-result',
      class: 'accepted-reader-result', hidden: true });
    let request = 0;
    let selected = null;
    function identity() {
      const id = LemmaAccount.user?.id, client = LemmaAccount.client;
      const handle = LemmaSync.accountHandle();
      if (Store.mode !== 'account' || App.workspaceBlocked ||
          !id || !client || !handle || handle.userId !== id)
        throw new Error('Use the signed-in account workspace to read accepted context');
      return { id, client, handle, generation: App.workspaceRevision };
    }
    function still(owner) {
      return result.isConnected && !App.workspaceBlocked &&
        App.workspaceRevision === owner.generation && Store.mode === 'account' &&
        LemmaAccount.user?.id === owner.id &&
        LemmaAccount.client === owner.client &&
        LemmaSync.accountHandle() === owner.handle;
    }
    function failure(err) {
      const message = String(err?.message || '');
      if (navigator.onLine === false || /offline/i.test(message))
        return 'Offline: accepted revisions and citations require a connection. No changes were made.';
      if (/knowledge_context_not_found/i.test(message))
        return 'No accepted revision was found for that context. Local drafts were not changed.';
      if (/invalid_knowledge_read|invalid_context_read|invalid_structured_context|Unverified|inconsistent|Cited source page differs/i.test(message))
        return 'Accepted knowledge could not be read because the revision or citations were inconsistent. Nothing was changed.';
      return 'Accepted knowledge could not be read. The knowledge RPC may not yet be deployed on this Lemma server; reconnect or try again later. Nothing was changed.';
    }
    function clear() {
      request++;
      selected = null;
      fill(result);
      result.hidden = true;
      read.disabled = false;
    }
    for (const input of [contextInput, revisionInput]) {
      input.addEventListener('input', () => {
        clear();
        status.textContent = 'Reference changed. Choose Read to fetch that accepted revision.';
      });
    }
    function sourceRow(ref, contextId, contextRevision, owner, current) {
      const sourceId = ref.source_id.toLowerCase();
      const row = h('section', { class: 'accepted-reader-source' },
        h('h4', { text: typeof ref.title === 'string' && ref.title.trim()
          ? ref.title.trim().slice(0, 160) : 'Cited source' }),
        h('p', { class: 'muted small', text: 'Source ' + sourceId +
          ' · pinned source revision ' + ref.revision }));
      const excerpts = h('div', { class: 'accepted-reader-excerpts' });
      const message = h('p', { class: 'muted small', role: 'status',
        'aria-live': 'polite', text: 'Excerpts are fetched only on request.' });
      const next = h('button', { class: 'btn btn-sm accepted-reader-next',
        type: 'button', text: 'Read first 6 excerpts' });
      let cursor = null, busy = false, displayed = 0;
      const seen = new Set();
      next.onclick = async () => {
        if (busy || !still(owner) || selected !== current) return;
        busy = true;
        next.disabled = true;
        message.textContent = 'Reading pinned source excerpts…';
        const generation = request;
        try {
          const packet = await LemmaCloudBridge.readPinnedAcceptedCitation(
            contextId, sourceId, contextRevision, cursor, 6);
          if (!still(owner) || selected !== current || request !== generation || !row.isConnected)
            return;
          const page = packet?.source;
          const sectionIds = Array.isArray(page?.excerpts) ?
            page.excerpts.map(item => item?.section_id?.toLowerCase() || '') : [];
          if (!packet?.context || packet.context.revision !== contextRevision ||
              !page || page.source_id?.toLowerCase() !== sourceId ||
              page.source_revision !== ref.revision ||
              !Array.isArray(page.excerpts) || page.excerpts.length > 6 ||
              new Set(sectionIds).size !== sectionIds.length ||
              typeof page.has_more !== 'boolean' ||
              (page.has_more && page.excerpts.length === 0) ||
              page.excerpts.some(item => !uuid.test(item?.section_id || '') ||
                seen.has(item.section_id.toLowerCase()) ||
                typeof item.locator !== 'string' ||
                typeof item.title !== 'string' || typeof item.text !== 'string' ||
                !/^[0-9a-f]{64}$/i.test(item.sha256 || '')))
            throw new Error('Cited source page differs from its accepted revision');
          for (const item of page.excerpts) {
            seen.add(item.section_id.toLowerCase());
            excerpts.append(h('article', { class: 'accepted-reader-excerpt' },
              h('h5', { text: item.title || 'Untitled section' }),
              h('p', { class: 'muted small', text: item.locator }),
              h('pre', { class: 'knowledge-context-preview', text: item.text }),
              h('p', { class: 'muted small', text: 'SHA-256 ' + item.sha256 })));
          }
          if (page.excerpts.length)
            cursor = page.excerpts[page.excerpts.length - 1].section_id;
          displayed += page.excerpts.length;
          next.hidden = !page.has_more;
          next.textContent = 'Read next 6 excerpts';
          message.textContent = displayed + ' pinned excerpts displayed · source revision ' +
            ref.revision + (page.has_more ? ' · more available' : ' · end of source');
        } catch (err) {
          if (still(owner) && selected === current && request === generation)
            message.textContent = failure(err);
        } finally {
          if (still(owner) && selected === current && request === generation) {
            busy = false;
            next.disabled = false;
          }
        }
      };
      row.append(excerpts, message, next);
      return row;
    }
    read.onclick = async () => {
      clear();
      const contextId = contextInput.value.trim().toLowerCase();
      const rawRevision = revisionInput.value.trim();
      const chosen = rawRevision === '' ? null : Number(rawRevision);
      if (!uuid.test(contextId) ||
          (chosen !== null && (!/^[1-9]\d*$/.test(rawRevision) ||
            !Number.isSafeInteger(chosen)))) {
        status.textContent = 'Enter a valid context UUID and a positive integer revision, or leave revision blank for latest.';
        return;
      }
      let owner;
      try { owner = identity(); }
      catch (err) { status.textContent = err.message; return; }
      const generation = request;
      read.disabled = true;
      status.textContent = 'Fetching the requested accepted revision…';
      try {
        const context = await LemmaCloudBridge.readAcceptedContext(contextId, chosen);
        if (!still(owner) || request !== generation ||
            contextInput.value.trim().toLowerCase() !== contextId ||
            revisionInput.value.trim() !== rawRevision) return;
        if (!context || typeof context !== 'object' ||
            context.context_id?.toLowerCase() !== contextId ||
            !Number.isSafeInteger(context.revision) || context.revision < 1 ||
            (chosen !== null && context.revision !== chosen))
          throw new Error('Unverified accepted revision response');
        const current = { contextId, revision: context.revision };
        selected = current;
        const content = h('div', { class: 'accepted-reader-context' },
          h('h3', { text: typeof context.title === 'string' && context.title.trim()
            ? context.title.slice(0, 512) : 'Accepted study context' }),
          h('p', { class: 'muted small', text: 'Accepted revision ' +
            context.revision + ' · read-only server snapshot' }),
          h('pre', { class: 'knowledge-context-preview',
            text: typeof context.context_markdown === 'string'
              ? context.context_markdown : '(No context Markdown)' }));
        const sources = h('div', { class: 'accepted-reader-sources' });
        const refs = context.accepted_json?.source_refs;
        if (context.format !== 'structured_v1' || !Array.isArray(refs)) {
          sources.append(h('p', { class: 'muted small',
            text: 'This accepted revision has no structured source citations.' }));
        } else if (refs.some(ref =>
          !uuid.test(ref?.source_id || '') || !Number.isSafeInteger(ref.revision) ||
          ref.revision < 1)) {
          throw new Error('Unverified accepted source references');
        } else if (!refs.length) {
          sources.append(h('p', { class: 'muted small',
            text: 'No cited sources are attached to this accepted revision.' }));
        } else {
          for (const ref of refs.slice(0, 16))
            sources.append(sourceRow(ref, contextId, context.revision, owner, current));
          if (refs.length > 16)
            sources.append(h('p', { class: 'muted small',
              text: 'Showing the first 16 of ' + refs.length +
                ' referenced sources; no additional source pages were fetched.' }));
        }
        fill(result, content, sources);
        result.hidden = false;
        status.textContent = 'Accepted revision loaded read-only. Source excerpts remain unfetched until selected.';
      } catch (err) {
        if (still(owner) && request === generation) {
          selected = null;
          fill(result);
          result.hidden = true;
          status.textContent = failure(err);
        }
      } finally {
        if (still(owner) && request === generation) read.disabled = false;
      }
    };
    return section('set-accepted-reader', 'Accepted study revisions and citations',
      'Explicit owner-scoped reads only. Review a published revision and fetch at most six pinned source excerpts per request; nothing is approved, saved or published here.',
      h('label', { class: 'setting-label', for: 's-accepted-id', text: 'Accepted context ID' }),
      contextInput,
      h('label', { class: 'setting-label', for: 's-accepted-revision',
        text: 'Accepted revision (optional)' }),
      revisionInput, h('div', { class: 'btn-row' }, read), status, result);
  }

  function knowledgeDraftSection() {
    const editor = KnowledgeDraftEditor.create();
    const id = h('input', { id: 's-knowledge-id', class: 'input', type: 'text',
      autocomplete: 'off', spellcheck: 'false', placeholder: 'Saved context UUID' });
    const create = h('button', { class: 'btn btn-sm', type: 'button', text: 'New draft' });
    const open = h('button', { class: 'btn btn-sm', type: 'button', text: 'Open saved draft' });
    const title = h('input', { id: 's-knowledge-title', class: 'input', type: 'text',
      maxlength: 512, autocomplete: 'off' });
    const summary = h('textarea', { id: 's-knowledge-summary', class: 'input', rows: 3,
      maxlength: 4096, spellcheck: 'true' });
    const goals = h('textarea', { id: 's-knowledge-goals', class: 'input', rows: 3,
      spellcheck: 'true', placeholder: 'One goal per line (up to 16)' });
    const markdown = h('textarea', { id: 's-knowledge-markdown', class: 'input code-input',
      rows: 8, spellcheck: 'false', placeholder: 'Context, notation and references in Markdown' });
    const save = h('button', { class: 'btn btn-primary btn-sm', type: 'button',
      text: 'Save draft on this device' });
    const status = h('p', { id: 's-knowledge-status', class: 'muted small',
      role: 'status', 'aria-live': 'polite',
      text: 'No draft open. A saved draft is private to this account cache and is not accepted in the cloud.' });
    const fields = h('div', { class: 'knowledge-draft-fields', hidden: true },
      h('label', { class: 'setting-label', for: 's-knowledge-title', text: 'Context title' }), title,
      h('label', { class: 'setting-label', for: 's-knowledge-summary', text: 'Editable summary' }), summary,
      h('label', { class: 'setting-label', for: 's-knowledge-goals', text: 'Learning goals' }), goals,
      h('label', { class: 'setting-label', for: 's-knowledge-markdown', text: 'Context notes (Markdown)' }), markdown,
      h('div', { class: 'btn-row' }, save));
    const inspectAccepted = h('button', { id: 's-knowledge-inspect', class: 'btn btn-sm',
      type: 'button', hidden: true, text: 'Open accepted revision reader' });
    const compare = h('button', { id: 's-knowledge-compare', class: 'btn btn-sm',
      type: 'button', hidden: true, text: 'Compare with accepted revision' });
    const reopen = h('button', { id: 's-knowledge-reopen', class: 'btn btn-sm',
      type: 'button', hidden: true, text: 'Reopen as unapproved draft' });
    const review = h('div', { id: 's-knowledge-review', class: 'knowledge-context-review',
      hidden: true, 'aria-live': 'polite' });
    const reviewDraft=h('button',{id:'s-knowledge-review-draft',class:'btn btn-sm',
      type:'button',hidden:true,text:'Review saved draft'});
    const publish=h('button',{id:'s-knowledge-submit',class:'btn btn-primary btn-sm',
      type:'button',hidden:true,text:'Publish approved context'});
    const approval=h('div',{id:'s-knowledge-approval',class:'knowledge-context-review',
      hidden:true,'aria-live':'polite'});
    let reviewedDraft=null,compared=null,busyApproval=false;
    // An old Settings panel must not prefill another owner's reader after a switch.
    const mountedOwner = LemmaAccount.user?.id;
    const mountedHandle = LemmaSync.accountHandle();
    const mountedGeneration = App.workspaceRevision;
    function clearApproval() {
      reviewedDraft=null;approval.hidden=true;fill(approval);
    }
    function clearComparison() {
      compared = null;
      review.hidden = true;
      reopen.hidden = true;
      fill(review);
    }
    function show(row) {
      clearApproval();clearComparison();
      reviewDraft.hidden=row.status!=='draft';
      publish.hidden=row.status!=='approved_pending';
      compare.hidden = row.status !== 'needs_review';
      inspectAccepted.hidden = row.status === 'unsaved';
      id.value = row.contextId;
      title.value = row.title || '';
      summary.value = typeof row.payload?.summary === 'string' ? row.payload.summary : '';
      goals.value = Array.isArray(row.payload?.goals) ? row.payload.goals.join('\n') : '';
      markdown.value = row.markdown || '';
      const locked = ['approved_pending','needs_review','published'].includes(row.status);
      for (const control of [title, summary, goals, markdown]) control.disabled = locked;
      save.disabled = locked;
      fields.hidden = false;
      status.textContent = row.status === 'needs_review'
        ? 'Accepted-context revision conflict. This reviewed draft is locked and was not applied to the cloud. Keep its context ID; inspect the current accepted revision before making a new approval decision.'
        : row.status === 'approved_pending'
          ? 'Approved on this device, but NOT published. Choose Publish approved context separately; a failed or offline submission retains the same approval.'
        : row.status === 'published'
          ? 'Accepted context published at revision '+row.publishedRevision+'. Copy the Context ID and this revision into your first Study plan. Open accepted revision reader to verify the published context.'
        : row.status === 'unsaved'
          ? 'New unsaved student draft. Save it locally before leaving this page.'
          : 'Local draft revision ' + row.localRevision + ' saved on this device. Not accepted or sent to cloud.' +
            (row.authorKind === 'tutor' ? ' Tutor proposal: still unaccepted.' : '');
    }
    function dirty() {
      const row = editor.current();
      if (!row || ['approved_pending', 'needs_review'].includes(row.status)) return false;
      return title.value !== (row.title || '') ||
        summary.value !== (row.payload?.summary || '') ||
        goals.value !== (Array.isArray(row.payload?.goals) ? row.payload.goals.join('\n') : '') ||
        markdown.value !== (row.markdown || '');
    }
    for (const field of [title,summary,goals,markdown])field.addEventListener('input',()=>{
      if(reviewedDraft){clearApproval();status.textContent=
        'Unsaved changes invalidate the review. Save your edits and review again.';}
    });
    async function maySwitch() {
      if (!dirty()) return true;
      return confirmDialog({ title: 'Leave unsaved context edits?',
        message: 'Changes in this form have not been saved to the private account cache. Copy them before switching drafts.',
        confirmLabel: 'Leave unsaved edits', danger: true });
    }
    create.onclick = async () => {
      if (!await maySwitch()) return;
      try { show(editor.start()); }
      catch (err) { status.textContent = err.message; }
    };
    open.onclick = async () => {
      if (!await maySwitch()) return;
      open.disabled = true;
      try { show(await editor.open(id.value)); }
      catch (err) { status.textContent = err.message; }
      finally { open.disabled = false; }
    };
    save.onclick = async () => {
      save.disabled = true;
      create.disabled = open.disabled = true;
      for (const control of [title, summary, goals, markdown]) control.disabled = true;
      try { show(await editor.save({ title: title.value, summary: summary.value,
        goals: goals.value, markdown: markdown.value })); }
      catch (err) { status.textContent = err.message; }
      finally {
        const locked = ['approved_pending', 'needs_review'].includes(editor.current()?.status);
        for (const control of [title, summary, goals, markdown]) control.disabled = locked;
        save.disabled = locked;
        create.disabled = open.disabled = false;
      }
    };
    reviewDraft.onclick=async()=>{
      if (busyApproval || reviewDraft.disabled) return;
      if (dirty()) {
        clearApproval();
        status.textContent='Save or revert your edits before reviewing the exact saved context.';
        return;
      }
      clearApproval();busyApproval=true;reviewDraft.disabled=true;
      try {
        const reviewed=await editor.reviewSaved();
        if (dirty() || editor.current()?.localRevision!==reviewed.localRevision)
          throw new Error('Unsaved edits changed this context; save and review again');
        reviewedDraft=reviewed;
        const approve=h('button',{id:'s-knowledge-approve',class:'btn btn-primary btn-sm',
          type:'button',text:'Approve this reviewed context'});
        approve.onclick=async()=>{
          if (busyApproval || reviewedDraft!==reviewed || dirty()) {
            clearApproval();
            status.textContent='Review expired or context changed; save and review again.';
            return;
          }
          busyApproval=true;approve.disabled=true;
          try {
            const row=await editor.approveReviewed(reviewed);
            show(row);
          } catch(err) {
            clearApproval();
            status.textContent='Approval not confirmed: '+(err.message||'reopen the saved draft')+
              '. Reopen and review the exact saved revision before retrying.';
          } finally {busyApproval=false;approve.disabled=false;}
        };
        fill(approval,
          h('h3',{text:'Review saved context before approval'}),
          h('p',{class:'muted small',text:
            'Local revision '+reviewed.localRevision+' · Context ID '+reviewed.contextId+
            ' · current accepted revision '+reviewed.expectedRevision}),
          h('p',{text:'Title: '+reviewed.title}),
          h('p',{text:'Summary: '+(reviewed.payload?.summary||'(empty)')}),
          h('p',{text:'Learning goals'}),
          h('pre',{class:'knowledge-context-preview',
            text:(reviewed.payload?.goals||[]).join('\n')||'(none)'}),
          h('p',{text:'Context notes'}),
          h('pre',{class:'knowledge-context-preview',text:reviewed.markdown||'(empty)'}),
          h('p',{class:'muted small',text:
            'Approval locks this exact local snapshot. It does not publish or sync it. Publication is a separate action.'}),
          approve);
        approval.hidden=false;
        status.textContent='Read the saved snapshot below. Only Approve this reviewed context records approval.';
      } catch(err) {
        clearApproval();
        status.textContent='Review unavailable: '+(err.message||'reopen the saved draft');
      } finally {busyApproval=false;reviewDraft.disabled=false;}
    };
    publish.onclick=async()=>{
      if(busyApproval || publish.disabled)return;
      if (!editor.current() || editor.current().status!=='approved_pending')return;
      busyApproval=true;publish.disabled=true;
      try {
        const receipt=await editor.submitApproved();
        if(receipt.status==='confirmed')show(editor.current());
        else if(receipt.status==='conflict'){
          show(editor.current());
          status.textContent='Accepted revision changed on the server. Compare the locked intent before making a new approval decision.';
        } else status.textContent='Offline: approved intent is preserved on this device. Reconnect and press Publish approved context again; the original request ID is retained.';
      } catch(err) {
        status.textContent='Publication not confirmed: '+(err.message||'network error')+
          '. Your approved intent remains locked; retry Publish, never create a duplicate draft.';
      } finally {busyApproval=false;publish.disabled=false;}
    };
    inspectAccepted.onclick = () => {
      const row = editor.current();
      if (!row || row.status === 'unsaved' ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.contextId || '') ||
          !mountedOwner || mountedOwner !== LemmaAccount.user?.id ||
          mountedHandle !== LemmaSync.accountHandle() ||
          mountedGeneration !== App.workspaceRevision ||
          Store.mode !== 'account' || App.workspaceBlocked) {
        status.textContent = 'Account or draft changed. Reopen your saved draft before inspecting it.';
        return;
      }
      const reader = document.getElementById('set-accepted-reader');
      const acceptedId = reader?.querySelector('#s-accepted-id');
      const acceptedRevision = reader?.querySelector('#s-accepted-revision');
      if (!acceptedId || !acceptedRevision) {
        status.textContent = 'Accepted reader unavailable. Reopen Settings and try again.';
        return;
      }
      // Input events invalidate prior responses and in-flight citation reads.
      // Opening the reader never makes an RPC or accepts a draft.
      acceptedId.value = row.contextId.toLowerCase();
      acceptedId.dispatchEvent(new Event('input', { bubbles: true }));
      acceptedRevision.value = '';
      acceptedRevision.dispatchEvent(new Event('input', { bubbles: true }));
      reader.scrollIntoView({ block: 'start' });
      acceptedId.focus({ preventScroll: true });
      status.textContent = 'Reader prepared for this context ID. Choose Read accepted revision to fetch the latest accepted snapshot; the saved draft remains unapproved.';
    };
    compare.onclick = async () => {
      compare.disabled = true;
      clearComparison();
      try {
        const packet = await editor.compareConflict();
        compared = packet;
        const side = (heading, label, item, payload) =>
          h('section', { class: 'knowledge-context-side' },
            h('h3', { text: heading }),
            h('p', { class: 'muted small', text: label }),
            h('p', { class: 'small', text: item.title || 'Untitled context' }),
            h('pre', { class: 'knowledge-context-preview',
              text: item.markdown || item.context_markdown || '(No Markdown)' }),
            h('details', null,
              h('summary', { text: 'Structured context fields' }),
              h('pre', { class: 'knowledge-context-preview',
                text: JSON.stringify(payload ?? null, null, 2) })));
        fill(review,
          h('p', { class: 'small',
            text: 'Read-only comparison. Neither version is overwritten or approved by inspecting it.' }),
          h('div', { class: 'knowledge-context-versions' },
            side('Your reviewed attempt', 'Local revision ' + packet.local.localRevision +
              ' · request not applied to cloud', packet.local, packet.local.payload),
            side('Current accepted revision', 'Server revision ' + packet.accepted.revision +
              ' · already accepted in your account', packet.accepted, packet.accepted.accepted_json)));
        review.hidden = false;
        reopen.hidden = false;
        status.textContent = 'Compared revisions. Your original reviewed intent is still locked and preserved.';
      } catch (err) {
        clearComparison();
        status.textContent = 'Comparison unavailable: ' + err.message;
      } finally { compare.disabled = false; }
    };
    reopen.onclick = async () => {
      if (!compared) return;
      const packet = compared;
      const agreed = await confirmDialog({
        title: 'Reopen as an unapproved local draft?',
        message: 'Your previous approved intent and conflict evidence will be archived. Your notes will reopen locally against the accepted server revision. Nothing will be published or approved; you must review and approve again before submitting.',
        confirmLabel: 'Reopen draft'
      });
      if (!agreed) return;
      reopen.disabled = true;
      try { show(await editor.reopenConflict(packet)); }
      catch (err) {
        clearComparison();
        status.textContent = 'Could not reopen safely: ' + err.message + '. Compare again.';
      } finally { reopen.disabled = !compared; }
    };
    return section('set-knowledge-drafts', 'Private study context drafts',
      'Unaccepted drafts are saved only in this device’s signed-in account cache. Copy the context ID to reopen it after a reload. Saving does not approve or publish a context.',
      h('label', { class: 'setting-label', for: 's-knowledge-id', text: 'Context ID' }),
      id, h('div', { class: 'btn-row' }, create, open), status, fields,
      h('div', {class:'btn-row'},reviewDraft,publish),approval,
      h('div', { class: 'btn-row' }, inspectAccepted, compare, reopen), review);
  }

  function ratingProbs() {
    const first = [0, 0, 0, 0], rec = [0, 0, 0];
    const seen = new Set();
    for (const n of Model.notes.values()) for (const l of n.log) {
      if (l[5]) continue;
      const key = n.id + ':' + l[1];
      if (l[3] === 0 && !seen.has(key)) { seen.add(key); first[l[2] - 1]++; }
      else if (l[3] === 2 && l[2] > 1) rec[l[2] - 2]++;
    }
    const norm = (a, def) => { const t = a.reduce((x, y) => x + y, 0); return t >= 50 ? a.map((x) => x / t) : def; };
    return { first: norm(first, [0.24, 0.094, 0.495, 0.171]), recall: norm(rec, [0.224, 0.631, 0.145]) };
  }

  function optimizerSection() {
    const s = Model.settings;
    const hist = Model.histories(null);
    const ds = FSRS.buildDataset(hist, Model.clock);
    const enough = ds.items >= 64;
    const status = s.wSource === 'optimized' && s.wInfo
      ? `Personalized on ${fmtDate(s.wInfo.at)} from ${plural(s.wInfo.items, 'review')}.`
      : s.wSource === 'custom' ? 'Using parameters you entered.' : 'Using FSRS-6 defaults.';
    const out = h('div', { class: 'opt-out', 'aria-live': 'polite' });
    const bar = h('div', { class: 'opt-progress', hidden: true }, h('span'));
    const btn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', disabled: !enough, html: icon('sigma', 16) + '<span>Optimize from my reviews</span>', onclick: async () => {
      const generation = App.workspaceRevision;
      btn.disabled = true;
      bar.hidden = false;
      fill(out, h('p', { class: 'muted small thinking', text: 'Fitting the 21 parameters to your review history…' }));
      try {
        const res = await Jobs.exec('optimize', {
          histories: hist, rollover: s.rollover, current: s.w,
          numRelearnSteps: (FSRS.parseSteps(s.relearnSteps) || []).length || 1,
        }, (p) => { bar.firstChild.style.width = (p * 100).toFixed(0) + '%'; });
        if (generation !== App.workspaceRevision || App.workspaceBlocked) return;
        optResult = res;
        optResultGeneration = generation;
        showResult();
      } catch (e) {
        if (generation === App.workspaceRevision && !App.workspaceBlocked)
          fill(out, h('p', { class: 'ai-error', text: 'Optimization failed: ' + e.message }));
      }
      if (generation === App.workspaceRevision) {
        bar.hidden = true;
        btn.disabled = !enough;
      }
    } });
    function showResult() {
      const r = optResult;
      if (!r || optResultGeneration !== App.workspaceRevision || App.workspaceBlocked) return;
      if (r.skipped) { fill(out, h('p', { class: 'muted small', text: 'Not enough history yet. Keep reviewing and try again.' })); return; }
      const better = r.after.logLoss < r.before.logLoss - 1e-4;
      const row = (label, ev) => h('tr', null, h('td', { text: label }), h('td', { text: ev.logLoss.toFixed(4) }), h('td', { text: fmtPct(ev.rmse, 2) }));
      fill(out, 
        h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, ['Parameters', 'Log loss', 'Calibration error'].map((t) => h('th', { scope: 'col', text: t })))),
          h('tbody', null, row('Current', r.before), row('Defaults', r.defaults), row('Optimized', r.after)))),
        h('p', { class: 'small ' + (better ? '' : 'muted'), text: r.pretrainOnly
          ? 'With this much history only the starting stabilities were fitted; the rest stay at their defaults.'
          : better ? 'The optimized parameters predict your reviews better. Lower is better for both numbers.' : 'Your current parameters already fit about as well, so there is no need to change them.' }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Use optimized parameters', onclick: () => {
            if (optResultGeneration !== App.workspaceRevision || App.workspaceBlocked) return;
            Model.setSettings({ w: r.w, wSource: 'optimized', wInfo: { at: Date.now(), items: r.items, logLoss: r.after.logLoss, rmse: r.after.rmse } });
            const n = Model.recomputeMemory();
            optResult = null;
            toast(`Parameters updated; memory recalculated for ${plural(n, 'note')}.`);
            App.render();
          } }),
          h('button', { class: 'btn btn-sm', type: 'button', text: 'Discard', onclick: () => { optResult = null; fill(out); } })));
    }
    const params = h('textarea', { id: 's-w', class: 'input code-input', rows: 3, spellcheck: 'false' });
    params.value = s.w.map((x) => +x.toFixed(4)).join(', ');
    const applyParams = h('button', { class: 'btn btn-sm', type: 'button', text: 'Apply', onclick: () => {
      const w = FSRS.normalizeParams(params.value);
      if (!w) { toast('Enter 21 numbers (FSRS-6), or 19 / 17 from older versions.', { kind: 'error' }); return; }
      Model.setSettings({ w, wSource: 'custom', wInfo: null });
      const n = Model.recomputeMemory();
      toast(`Parameters applied; memory recalculated for ${plural(n, 'note')}.`);
      App.render();
    } });
    const reset = h('button', { class: 'btn btn-sm', type: 'button', text: 'Reset to defaults', onclick: () => {
      Model.setSettings({ w: FSRS.DEFAULT_W.slice(), wSource: 'default', wInfo: null });
      Model.recomputeMemory();
      toast('Default parameters restored.');
      App.render();
    } });
    const sec = h('section', { class: 'panel settings-sec', id: 'fsrs-opt' },
      h('h2', { class: 'section-title', text: 'Personalize FSRS' }),
      h('p', { class: 'muted small sec-intro', text: status }),
      h('p', { class: 'small', text: enough
        ? `${plural(ds.items, 'spaced review')} · runs on this device`
        : `Needs 64 spaced reviews · ${ds.items} so far` }),
      h('div', { class: 'btn-row' }, btn), bar, out,
      h('details', { class: 'adv' }, h('summary', { text: 'Parameters' }),
        h('p', { class: 'muted small', text: 'Paste 21 numbers from Anki’s FSRS options.' }),
        params, h('div', { class: 'btn-row' }, applyParams, reset)));
    if (optResult) setTimeout(showResult, 0);
    return sec;
  }

  async function deleteAll() {
    const n = Model.notes.size;
    if (!n) return;
    const generation = App.workspaceRevision;
    const ok = await confirmDialog({ title: `Delete all ${plural(n, 'note')}?`, message: 'Every card and its review history will be removed. Export a backup first if you might want them back. This can’t be undone.', confirmLabel: 'Delete everything', danger: true });
    if (!ok || App.workspaceBlocked || generation !== App.workspaceRevision) return;
    for (const id of [...Model.notes.keys()]) Model.deleteNote(id);
    toast('All cards deleted');
    App.go('home');
  }

  return { render };
})();
