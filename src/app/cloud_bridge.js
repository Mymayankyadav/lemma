/* Explicit account-scoped cloud transfer helpers. */
const LemmaCloudBridge = (() => {
  async function authorize() {
    const client = LemmaAccount.client;
    if (!client) throw new Error('Cloud client unavailable');
    const response = await client.auth.getUser();
    if (response.error || !response.data?.user) throw new Error('Sign in first');
    const userId = response.data.user.id;
    const token = await LemmaCloud.accountToken(client, userId);
    return { client, userId, token };
  }
  async function listRemote(context) {
    const { client, userId, token } = context || await authorize();
    const rows = [];
    let cursor = null;
    for (;;) {
      await LemmaCloud.accountToken(client, userId);
      let query = client.from('notes').select('id,data,revision,deleted_at')
        .eq('user_id', userId).order('id').limit(500);
      if (cursor !== null) query = query.gt('id', cursor);
      const response = await query.setHeader('Authorization', 'Bearer ' + token);
      if (response.error) throw response.error;
      rows.push(...response.data);
      if (response.data.length < 500) break;
      cursor = response.data[response.data.length - 1].id;
    }
    return rows;
  }
  async function inspect() {
    const rows = await listRemote();
    return { local: Model.notes.size, remote: rows.filter(r => !r.deleted_at).length };
  }
  async function uploadMissing() {
    const context = await authorize();
    const { client, userId } = context;
    const snapshots = [...Model.notes.values()].map(n => structuredClone(n));
    await Store.whenSaved();
    const known = new Set((await listRemote(context)).map(r => r.id));
    let copied = 0, skipped = 0;
    for (const note of snapshots) {
      if (known.has(note.id)) { skipped++; continue; }
      const token = await LemmaCloud.accountToken(client, userId);
      const result = await client.rpc('commit_note', {
        p_note_id: note.id, p_expected_revision: 0,
        p_request_id: crypto.randomUUID(),
        p_data: JSON.parse(JSON.stringify(note)), p_delete: false
      }).setHeader('Authorization', 'Bearer ' + token);
      if (result.error) {
        if ((result.error.message || '').includes('stale_note_revision')) {
          skipped++; continue;
        }
        throw new Error('Stopped after ' + copied + ' copies: ' + result.error.message);
      }
      copied++;
    }
    return { copied, skipped };
  }
  async function importMissing() {
    if (Store.mode !== 'local') throw new Error('Browser local storage required');
    const context = await authorize();
    const rows = await listRemote(context);
    let copied = 0, skipped = 0;
    for (const row of rows) {
      await LemmaCloud.accountToken(context.client, context.userId);
      const n = row.data;
      if (row.deleted_at || Model.notes.has(row.id) || !n ||
          n.id !== row.id || typeof n.front !== 'string' ||
          typeof n.back !== 'string' || !Array.isArray(n.log)) {
        skipped++; continue;
      }
      Model.createNote(JSON.parse(JSON.stringify(n)));
      await Store.whenSaved();
      copied++;
    }
    return { copied, skipped };
  }
  return { authorize, listRemote, inspect, uploadMissing, importMissing };
})();

