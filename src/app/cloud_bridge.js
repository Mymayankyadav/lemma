/* Explicit account-scoped cloud transfer helpers. */
const LemmaCloudBridge = (() => {
  async function authorize() {
    const client = LemmaAccount.client;
    if (!client) throw new Error('Cloud client unavailable');
    const response = await client.auth.getUser();
    if (response.error || !response.data?.user) throw new Error('Sign in first');
    return { client, userId: response.data.user.id };
  }
  async function listRemote() {
    const { client, userId } = await authorize();
    const rows = [];
    for (let offset = 0;; offset += 500) {
      const response = await client.from('notes').select('id,data,revision,deleted_at')
        .eq('user_id', userId).order('id').range(offset, offset + 499);
      if (response.error) throw response.error;
      rows.push(...response.data);
      if (response.data.length < 500) break;
    }
    return rows;
  }
  async function inspect() {
    const rows = await listRemote();
    return { local: Model.notes.size, remote: rows.filter(r => !r.deleted_at).length };
  }
  async function uploadMissing() {
    const { client } = await authorize();
    const known = new Set((await listRemote()).map(r => r.id));
    let copied = 0, skipped = 0;
    for (const note of Model.notes.values()) {
      if (known.has(note.id)) { skipped++; continue; }
      const result = await client.rpc('commit_note', {
        p_note_id: note.id, p_expected_revision: 0,
        p_request_id: crypto.randomUUID(),
        p_data: JSON.parse(JSON.stringify(note)), p_delete: false
      });
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
  return { authorize, listRemote, inspect, uploadMissing };
})();
