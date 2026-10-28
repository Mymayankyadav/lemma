'use strict';
// RELEASE-01 R2b: executable contract for a lossless owner-scoped account archive.
// It validates snapshots; it DOES NOT grant a database restore permission.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = Object.freeze({
  study_plans: ['id'], learning_sessions: ['id'], learning_events: ['seq'],
  tutor_handoffs: ['session_id'], study_context_files: ['id'],
  study_plan_versions: ['plan_id','revision'],
  study_checkpoints: ['plan_id','checkpoint_id'],
  notes: ['id'], profiles: ['user_id'], review_events: ['event_id'],
  learning_sources: ['id'], learning_sections: ['id'],
  learning_card_links: ['note_id','session_id','relation'],
  client_mutation_receipts: ['request_id'], review_retractions: ['retraction_id'],
  study_context_revisions: ['context_id','revision'],
  knowledge_source_versions: ['source_id','revision'],
  knowledge_section_versions: ['source_id','source_revision','section_id'],
});
const TABLES = Object.keys(KEYS).sort();
const fail = msg => { throw new Error('Account archive rejected: ' + msg); };
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const hex = value => createHash('sha256').update(value, 'utf8').digest('hex');
function canonical(value, depth = 0) {
  if (depth > 32) fail('JSON nesting exceeds safety limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(x => canonical(x, depth + 1)).join(',') + ']';
  if (!isObject(value)) fail('non-JSON value');
  const names = Object.keys(value).sort();
  if (names.some(k => ['__proto__','prototype','constructor'].includes(k))) fail('unsafe object key');
  return '{' + names.map(k => JSON.stringify(k) + ':' + canonical(value[k], depth + 1)).join(',') + '}';
}
function rowKey(table, row) {
  return KEYS[table].map(field => {
    const value = row[field];
    if (value === undefined || value === null || value === '') fail(table + ' missing key ' + field);
    return canonical(value);
  }).join('|');
}
function sortedRows(table, rows) {
  if (!Array.isArray(rows) || rows.length > 100000) fail(table + ' invalid or oversized rows');
  const keys = new Set();
  for (const row of rows) {
    if (!isObject(row)) fail(table + ' row must be object');
    const key = rowKey(table, row);
    if (keys.has(key)) fail(table + ' duplicate primary key');
    keys.add(key);
  }
  return [...rows].sort((a,b) => rowKey(table,a).localeCompare(rowKey(table,b)));
}
function assertOwnerTables(ownerId, tables) {
  if (!UUID.test(ownerId)) fail('invalid owner ID');
  if (!isObject(tables) || canonical(Object.keys(tables).sort()) !== canonical(TABLES))
    fail('incomplete or unexpected table inventory');
  let count = 0;
  for (const table of TABLES) {
    const rows = sortedRows(table, tables[table]);
    count += rows.length;
    for (const row of rows) {
      if (String(row.user_id || '').toLowerCase() !== ownerId.toLowerCase())
        fail(table + ' contains foreign or missing owner ID');
      canonical(row);
    }
  }
  if (count > 200000) fail('archive exceeds record cap');
  if (Buffer.byteLength(canonical(tables), 'utf8') > 64 * 1024 * 1024)
    fail('archive exceeds 64 MiB safety limit');
  return count;
}
function checkUniqueConstraints(tables) {
  const unique = {
    learning_events: ['event_id'],
    study_context_revisions: ['request_id'],
    knowledge_source_versions: ['request_id'],
    review_retractions: ['target_event_id'],
  };
  for (const [table, columns] of Object.entries(unique)) {
    for (const column of columns) {
      const seen = new Set();
      for (const row of tables[table]) {
        if (row[column] == null) continue;
        const key = canonical(row[column]);
        if (seen.has(key)) fail(table + ' duplicate unique ' + column);
        seen.add(key);
      }
    }
  }
  for (const table of TABLES)
    for (const row of tables[table])
      for (const field of ['seq','revision','source_revision','context_revision'])
        if (row[field] !== undefined && row[field] !== null &&
            (!Number.isSafeInteger(row[field]) || row[field] < 0))
          fail(table + ' unsafe or invalid numeric ' + field);
}
function checkReferences(tables) {
  const refs = [
    ['learning_sessions','plan_id','study_plans','id'],
    ['tutor_handoffs','session_id','learning_sessions','id'],
    ['learning_events','session_id','learning_sessions','id'],
    ['study_plan_versions','plan_id','study_plans','id'],
    ['study_plan_versions','context_id','study_context_files','id'],
    ['study_checkpoints','plan_id','study_plans','id'],
    ['study_checkpoints','last_evidence_event_id','learning_events','event_id'],
    ['study_context_revisions','context_id','study_context_files','id'],
    ['learning_sections','source_id','learning_sources','id'],
    ['knowledge_source_versions','source_id','learning_sources','id'],
    ['knowledge_source_versions','context_id','study_context_files','id'],
    ['learning_card_links','note_id','notes','id'],
    ['learning_card_links','session_id','learning_sessions','id'],
    ['review_events','note_id','notes','id'],
    ['review_retractions','target_event_id','review_events','event_id'],
  ];
  for (const [from,column,to,targetColumn] of refs) {
    const targetValues = new Set(tables[to].map(row => canonical(row[targetColumn])));
    for (const row of tables[from]) {
      if (row[column] != null && !targetValues.has(canonical(row[column])))
        fail(from + '.' + column + ' references a missing ' + to + ' record');
    }
  }
  const sourceVersions = new Set(tables.knowledge_source_versions.map(row =>
    canonical([row.source_id, row.revision])));
  for (const row of tables.knowledge_section_versions)
    if (!sourceVersions.has(canonical([row.source_id,row.source_revision])))
      fail('knowledge section lacks its exact source revision');
}
function manifestFor(ownerId, migrations, tables, exportedAt) {
  const counts = {}, hashes = {};
  for (const table of TABLES) {
    const rows = sortedRows(table,tables[table]);
    counts[table] = rows.length;
    hashes[table] = hex(canonical(rows));
  }
  const aggregate = hex(canonical({app:'lemma',version:2,scope:'account-workspace',
    capture:'transactional',ownerId,exportedAt,migrations,counts,hashes}));
  return { counts, hashes, sha256: aggregate };
}
function verify(archive) {
  if (!isObject(archive) || archive.app !== 'lemma' || archive.version !== 2 ||
      archive.scope !== 'account-workspace' || archive.capture !== 'transactional' ||
      !Number.isFinite(Date.parse(archive.exportedAt)) ||
      !Array.isArray(archive.migrations) || archive.migrations.length < 12 ||
      !archive.migrations.every(x => /^\d{14}$/.test(x)) ||
      new Set(archive.migrations).size !== archive.migrations.length ||
      archive.migrations.some((x,i) => i && x <= archive.migrations[i-1]))
    fail('invalid account archive envelope or migration history');
  const count = assertOwnerTables(archive.ownerId,archive.tables);
  checkUniqueConstraints(archive.tables);
  checkReferences(archive.tables);
  const expected = manifestFor(archive.ownerId,archive.migrations,archive.tables,archive.exportedAt);
  if (!isObject(archive.manifest) || canonical(archive.manifest) !== canonical(expected))
    fail('checksum or count mismatch');
  // These hashes detect accidental corruption; they are not signatures, nor
  // proof that the backend performed an atomic, authenticated snapshot.
  return { count, tableCount: TABLES.length, sha256: expected.sha256 };
}
function makeArchive({ ownerId, tables, migrations, exportedAt }) {
  assertOwnerTables(ownerId,tables);
  checkUniqueConstraints(tables);
  checkReferences(tables);
  const archive = {app:'lemma',version:2,scope:'account-workspace',
    capture:'transactional',ownerId,exportedAt,
    migrations,tables,manifest:manifestFor(ownerId,migrations,tables,exportedAt)};
  verify(archive);
  return archive;
}

if (require.main === module) {
  const owner = '11111111-1111-4111-8111-111111111111';
  const foreign = '22222222-2222-4222-8222-222222222222';
  const u = n => 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(n).padStart(12,'0');
  const rows = Object.fromEntries(TABLES.map(table => [table, []]));
  const add = (table, data) => rows[table].push({user_id:owner,...data});
  add('profiles',{data:{settings:{retention:0.92}},revision:2});
  add('notes',{id:'lemma-a',data:{cards:{'1':{reps:3,due:400}},log:[[100,1,3]]},revision:2});
  add('review_events',{event_id:u(1),note_id:'lemma-a',ordinal:1,grade:3});
  add('review_retractions',{retraction_id:u(2),target_event_id:u(1)});
  add('study_context_files',{id:u(3),revision:2,context_markdown:'Definitions'});
  add('study_context_revisions',{context_id:u(3),revision:1,context_markdown:'Old'});
  add('study_context_revisions',{context_id:u(3),revision:2,context_markdown:'New'});
  add('learning_sources',{id:u(4),title:'Textbook'});
  add('learning_sections',{id:u(5),source_id:u(4),text_content:'Proposition'});
  add('knowledge_source_versions',{source_id:u(4),revision:1,context_id:u(3)});
  add('knowledge_section_versions',{source_id:u(4),source_revision:1,section_id:u(5),text_content:'Proof'});
  add('study_plans',{id:u(6),revision:2,plan:{checkpoints:[{id:'cp-1'}]}});
  add('study_plan_versions',{plan_id:u(6),revision:1,context_id:u(3),snapshot:{}});
  add('study_plan_versions',{plan_id:u(6),revision:2,context_id:u(3),snapshot:{}});
  add('learning_sessions',{id:u(7),plan_id:u(6)});
  add('learning_events',{seq:10,event_id:u(8),session_id:u(7),payload:{hintLevel:2}});
  add('study_checkpoints',{plan_id:u(6),checkpoint_id:'cp-1',last_evidence_event_id:u(8)});
  add('tutor_handoffs',{session_id:u(7),summary:{lastProof:'unfinished'}});
  add('learning_card_links',{note_id:'lemma-a',session_id:u(7),relation:'learned'});
  add('client_mutation_receipts',{request_id:u(9),entity_type:'note',entity_id:'lemma-a'});
  const migrations = Array.from({length:13},(_,i)=>String(20261026000000+i));
  const original = makeArchive({ownerId:owner,tables:rows,migrations,exportedAt:'2026-10-28T11:00:00Z'});
  assert.equal(verify(original).tableCount,18);
  const copy = obj => JSON.parse(JSON.stringify(obj));
  const negative = (mutate,regex) => {const bad=copy(original);mutate(bad);assert.throws(()=>verify(bad),regex);};
  negative(a => {a.tables.notes[0].user_id=foreign;},/foreign or missing owner/);
  negative(a => {a.tables.learning_events.push({...a.tables.learning_events[0]});},/duplicate primary key/);
  negative(a => {a.tables.learning_events.push({...a.tables.learning_events[0],seq:11});},/duplicate unique event_id/);
  negative(a => {a.tables.learning_events[0].seq=Number.MAX_SAFE_INTEGER+1;},/unsafe or invalid numeric seq/);
  negative(a => {a.tables.study_plan_versions.pop();},/checksum or count mismatch/);
  negative(a => {a.tables.knowledge_section_versions[0].source_revision=99;},/exact source revision/);
  negative(a => {a.tables.review_retractions[0].target_event_id=u(99);},/missing review_events/);
  negative(a => {delete a.tables.knowledge_source_versions;},/inventory/);
  negative(a => {a.tables.notes[0].data.log.push([101,1,4]);},/checksum/);
  negative(a => {a.migrations[12]=a.migrations[11];},/migration history/);
  negative(a => {a.capture='multi-request';},/envelope/);
  negative(a => {a.exportedAt='2026-10-28T12:00:00Z';},/checksum/);
  console.log('ok: complete 18-table account archive inventory, FK integrity, owner isolation, history, checksums and rejection tests');
}
module.exports = { TABLES, makeArchive, verify };
