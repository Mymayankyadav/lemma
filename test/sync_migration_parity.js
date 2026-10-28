'use strict';
const assert=require('node:assert/strict');
const {assertAllowedMigrationHistory,knowledgeMigrations,ownerSnapshotMigration}=require('./sync_security_parity.js');
const legacy=[
 {version:'20261026085028',name:'initial_learning_state'},
 {version:'20261026090019',name:'versioned_study_planning'},
 {version:'20261026090746',name:'cards_reviews_sources'},
 {version:'20261026090844',name:'atomic_plan_publication'},
 {version:'20261026090959',name:'revision_safe_note_writes'},
 {version:'20261026091125',name:'harden_rpc_implementations'},
 {version:'20261026121817',name:'enforce_note_rpc_writes'},
 {version:'20261026130428',name:'review_retractions'},
 {version:'20261026153542',name:'revision_safe_profiles'}
];
const base=[...legacy,...knowledgeMigrations];
const plan={version:'20261028100000',name:'plan01_learning_events'};
const tutor={version:'20261028101000',name:'tutor01_handoff_packets'};
assert.doesNotThrow(()=>assertAllowedMigrationHistory(base,legacy));
assert.doesNotThrow(()=>assertAllowedMigrationHistory([...base,plan],legacy));
assert.doesNotThrow(()=>assertAllowedMigrationHistory([...base,plan,tutor],legacy));
assert.doesNotThrow(()=>assertAllowedMigrationHistory([...base,plan,tutor,ownerSnapshotMigration],legacy));
assert.throws(()=>assertAllowedMigrationHistory([...base,plan,tutor,{...ownerSnapshotMigration,version:'20261028163001'}],legacy),/R2e snapshot migration version changed/);
assert.throws(()=>assertAllowedMigrationHistory([...base,plan,tutor,{...ownerSnapshotMigration,name:'release01_typo'}],legacy),/only named/);
assert.throws(()=>assertAllowedMigrationHistory(base.slice(0,11),legacy),/missing required knowledge/);
assert.throws(()=>assertAllowedMigrationHistory([...base.slice(0,9),base[10],base[9],base[11]],legacy),/knowledge migrations/);
assert.throws(()=>assertAllowedMigrationHistory([...base,{...plan,name:'unexpected_schema_change'}],legacy),/only named/);
assert.throws(()=>assertAllowedMigrationHistory([...base,{...plan,name:'knowledge_context_cas'}],legacy),/only named/);
assert.throws(()=>assertAllowedMigrationHistory([...base,plan,{...tutor,version:plan.version}],legacy),/timestamp-ordered|duplicate/);
assert.throws(()=>assertAllowedMigrationHistory([...base,tutor,plan],legacy),/timestamp-ordered/);
assert.throws(()=>assertAllowedMigrationHistory([...base,{...plan,version:'bad'}],legacy),/version/);
assert.throws(()=>assertAllowedMigrationHistory([...legacy.slice(0,8),{...legacy[8],name:'silently_renamed'},...knowledgeMigrations],legacy),/original nine/);
assert.throws(()=>assertAllowedMigrationHistory([...base,plan],legacy.slice(1)),/baseline changed/);
console.log('ok: migration parity requires exact legacy/knowledge history and permits only ordered plan/tutor or exact pinned R2e addition');
