/* SYNC-02: explicit conflict review for the private, opt-in account cache.
 * Decisions are delegated to AccountStorage's atomic CAS transaction.
 * This panel never enrolls a device or activates a workspace.
 */
const LemmaConflicts = (() => {
  const json = x => JSON.stringify(x, null, 2);
  const schedule = data => JSON.stringify({
    cards: data?.cards || {}, log: data?.log || []
  });
  function blockedReason(view) {
    if (!view) return 'Conflict no longer exists. Reload the list.';
    if (!view.remote?.known || !Number.isSafeInteger(view.remote.revision) ||
        view.remote.revision <= view.queued[0]?.expectedRevision)
      return 'A fresh server version is needed. Refresh the account cache.';
    if (view.queued.some(op => op.state === 'pending' && op.attempted && op.kind === view.kind))
      return 'An earlier request may have reached the server. Refresh to retry its receipt first.';
    if (view.kind === 'note') {
      const versions = [view.base?.known && view.base.data, view.local.data,
        view.remote.data, ...view.queued.filter(op => op.kind === 'note').map(op => op.data)].filter(Boolean);
      if (versions.some(data => schedule(data) !== schedule(versions[0])))
        return 'Review schedules differ. The original histories are preserved; resolution requires SYNC-03 replay.';
      if (view.queued.some(op => op.kind === 'review' || op.kind === 'retraction'))
        return 'Queued reviews or Undo require SYNC-03 replay before resolving this card.';
    }
    return '';
  }
  function decisionFor(view, choice, mergeText, confirmDelete, confirmRestore) {
    if (!['local','remote','merge'].includes(choice)) throw new Error('Choose a version.');
    if (blockedReason(view)) throw new Error(blockedReason(view));
    if (choice === 'merge' && !view.base?.known)
      throw new Error('The original version is unknown; manual merge is unavailable.');
    let selected = choice === 'remote' ? view.remote : view.local;
    let merged;
    if (choice === 'merge') {
      try { merged = JSON.parse(mergeText); } catch (_) { throw new Error('Merged JSON is invalid.'); }
      if (!merged || Array.isArray(merged) || typeof merged !== 'object' ||
          (view.kind === 'note' && merged.id !== view.entityId))
        throw new Error('Merged data must be an object with the original card ID.');
      selected = { data: merged, deleted: false };
    }
    const deleting = Boolean(selected.deleted);
    const restoring = !deleting && (view.remote.deleted ||
      view.queued.some(op => op.kind === 'note' && op.deleted));
    if (deleting && !confirmDelete) throw new Error('Confirm deletion explicitly.');
    if (restoring && !confirmRestore) throw new Error('Confirm restoration explicitly.');
    return { choice, ...(choice === 'merge' ? {data: merged, deleted: false} : {}),
      ...(deleting ? {confirmDelete: true} : {}),
      ...(restoring ? {confirmRestore: true} : {}) };
  }
  function lease() {
    const handle = LemmaSync.accountHandle(), userId = LemmaAccount.user?.id;
    if (!handle || !userId || handle.userId !== userId) throw new Error('Sign in and refresh the account cache first.');
    return {handle, userId, workspaceRevision: App.workspaceRevision};
  }
  function valid(l) {
    return LemmaSync.accountHandle() === l.handle &&
      LemmaAccount.user?.id === l.userId && App.workspaceRevision === l.workspaceRevision;
  }
  const btn = (label, click, className = 'btn btn-sm') =>
    h('button', {type: 'button', class: className, text: label, onclick: click});
  function versionPanel(title, v, isLocal = false) {
    const container = h('section', {class: 'conflict-version'},
      h('h4', {text: title}),
      h('p', {class: 'muted small', text: !v ? 'Unavailable' :
        (v.known === false ? 'Unknown original content' :
        ((v.deleted ? 'Deleted · ' : '') +
         'Revision ' + (v.revision ?? v.expectedRevision ?? (isLocal ? 'latest on device' : 'unknown'))))}));
    if (v && v.known !== false) {
      if (v.data) {
        const data = v.data;
        const preview = [data.title, data.front, data.back]
          .filter(x => typeof x === 'string' && x.trim()).join('\n\n');
        if (preview) container.append(h('pre', {class: 'conflict-preview', text: preview}));
        container.append(h('details', {}, h('summary', {text: 'All fields (JSON)'}),
          h('pre', {class: 'conflict-json', text: json(data)})));
      } else container.append(h('p', {class: 'muted small', text: v.deleted ? 'Tombstone: no active content' : 'No previous content'}));
    }
    return container;
  }
  function mount() {
    const host = h('div', {class: 'conflict-center'});
    const status = h('p', {class: 'muted small', role: 'status', 'aria-live': 'polite'});
    const contents = h('div', {class: 'conflict-items'});
    let sequence = 0;
    const still = (l, ticket) => valid(l) && host.isConnected && ticket === sequence;
    async function reload() {
      const ticket = ++sequence;
      fill(contents);
      status.textContent = 'Checking account conflicts…';
      let l;
      try {
        l = lease();
        const [ops, rows] = await Promise.all([l.handle.storage.list(), l.handle.storage.notes()]);
        if (!still(l, ticket)) return;
        const names = new Map(rows.map(row => [row.id, row.data?.title || row.data?.front?.slice(0, 70) || row.id]));
        const pending = ops.filter(op => op.state === 'conflict').sort((a,b) => (a.sequence || 0) - (b.sequence || 0));
        if (!pending.length) { status.textContent = 'No unresolved conflicts in this account cache.'; return; }
        status.textContent = pending.length + ' blocked operation(s). Nothing is discarded automatically.';
        for (const op of pending) {
          const name = op.kind === 'profile' ? 'Account profile' : names.get(op.entityId) || op.entityId;
          const item = h('div', {class: 'conflict-item'},
            h('div', {class: 'conflict-item-head'},
              h('div', {}, h('strong', {text: name}), h('p', {class: 'muted small',
                text: op.kind + ' · ' + op.entityId})),
              op.kind === 'note' || op.kind === 'profile'
                ? btn('Compare versions', () => inspect(op.id, l, item))
                : h('span', {class: 'muted small', text: 'Waiting for review replay'})));
          contents.append(item);
        }
      } catch (err) {
        if (!l || valid(l)) status.textContent = 'Could not inspect conflicts: ' + (err.message || err);
      }
    }
    async function inspect(id, l, item) {
      if (!valid(l) || !host.isConnected) return;
      const ticket = ++sequence;
      status.textContent = 'Loading conflict evidence…';
      try {
        const view = await l.handle.storage.inspectConflict(id);
        if (!still(l,ticket)) return;
        if (!view) { status.textContent = 'Conflict changed. Refresh the list.'; return; }
        status.textContent = 'Compare all versions before choosing. Changes are staged, not immediately cloud-confirmed.';
        for (const node of Array.from(contents.children)) if (node !== item) node.remove();
        const panel = h('div', {class: 'conflict-review'});
        const versions = h('div', {class: 'conflict-versions'},
          versionPanel('Common base', view.base),
          versionPanel('Latest on this device', view.local, true),
          versionPanel('Server version', view.remote));
        panel.append(versions);
        const history = h('details', {class: 'conflict-history'},
          h('summary', {text: 'Preserved queued history (' + view.queued.length + ')'}),
          ...view.queued.map(op => h('div', {class: 'conflict-history-row'},
            h('strong', {text: op.kind + (op.deleted ? ' · delete' : '')}),
            h('span', {class: 'muted small', text: ' · ' + op.state + ' · request ' + op.requestId}),
            op.data ? h('pre', {class: 'conflict-json', text: json(op.data)}) : null)));
        panel.append(history);
        const blocked = blockedReason(view);
        if (blocked) panel.append(h('p', {class: 'conflict-warning', role: 'alert', text: blocked}));
        const controls = h('div', {class: 'conflict-controls'});
        const choice = h('select', {class: 'input select', 'aria-label': 'Conflict resolution choice'},
          h('option', {value: 'local', text: 'Keep latest device version'}),
          h('option', {value: 'remote', text: 'Use server version'}),
          h('option', {value: 'merge', text: 'Merge manually (JSON)', disabled: !view.base?.known}));
        const mergeBox = h('textarea', {class: 'input conflict-merge', rows: 9, spellcheck: 'false',
          'aria-label': 'Merged data JSON'});
        mergeBox.value = json(view.local.data || view.remote?.data || view.base?.data || {});
        const mergeWrap = h('div', {class: 'conflict-merge-wrap'},
          h('label', {class: 'setting-label', text: 'Merged fields · retain the same ID and scheduling history'}), mergeBox);
        const deleteCheck = h('input', {type: 'checkbox'});
        const restoreCheck = h('input', {type: 'checkbox'});
        const deleteLabel = h('label', {class: 'conflict-confirm'}, deleteCheck,
          h('span', {text: 'I understand this will delete the card in my account.'}));
        const restoreLabel = h('label', {class: 'conflict-confirm'}, restoreCheck,
          h('span', {text: 'I explicitly want to restore a deleted card.'}));
        function adjust() {
          const selected = choice.value === 'remote' ? view.remote :
            choice.value === 'local' ? view.local : {deleted: false};
          mergeWrap.hidden = choice.value !== 'merge';
          deleteLabel.hidden = !selected?.deleted;
          restoreLabel.hidden = Boolean(selected?.deleted) || !(
            view.remote?.deleted || view.queued.some(op => op.kind === 'note' && op.deleted));
        }
        choice.onchange = () => { deleteCheck.checked = false; restoreCheck.checked = false; adjust(); };
        const actionStatus = h('p', {class: 'muted small', role: 'status', 'aria-live': 'polite'});
        const apply = btn('Save resolution to device', async () => {
          if (!valid(l)) return;
          let decision;
          try { decision = decisionFor(view, choice.value, mergeBox.value, deleteCheck.checked, restoreCheck.checked); }
          catch (err) { actionStatus.textContent = err.message; return; }
          apply.disabled = true;
          actionStatus.textContent = 'Saving resolution transaction…';
          try {
            // Atomic archive + projection + fresh request. A stale token fails without mutation.
            const op = await l.handle.storage.resolveConflict(view.id, view.token, decision);
            if (!valid(l) || !host.isConnected) return;
            // The active account Model must follow its durable projection. Never
            // project into an anonymous or different identity's workspace.
            if (Store.mode === 'account' && App.workspaceController?.activeId === l.userId) {
              if (op.kind === 'note') Model.applyRemote([{id: op.entityId, note: op.deleted ? null : clone(op.data)}]);
              else if (op.kind === 'profile') Model.loadProfile(clone(op.data));
            }
            actionStatus.textContent = 'Saved on this device. Waiting for cloud confirmation.';
            LemmaSync.kick();
            await reload();
          } catch (err) {
            if (valid(l)) {
              actionStatus.textContent = 'Resolution not confirmed: ' + (err.message || err) +
                '. Your choices remain here; inspect again if the conflict changed.';
              apply.disabled = false;
            }
          }
        }, 'btn btn-primary btn-sm');
        apply.disabled = Boolean(blocked);
        controls.append(h('label', {class: 'setting-label', text: 'Resolution choice'}), choice,
          mergeWrap, deleteLabel, restoreLabel, actionStatus,
          h('div', {class: 'btn-row'}, apply, btn('Back to conflicts', reload)));
        adjust();
        panel.append(controls);
        item.append(panel);
      } catch (err) {
        if (valid(l)) status.textContent = 'Comparison failed: ' + (err.message || err);
      }
    }
    host.append(h('div', {class: 'btn-row'}, btn('Review account conflicts', reload)),
      status, contents);
    return host;
  }
  return {mount, blockedReason, decisionFor};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaConflicts;
