const assert = require('node:assert/strict');
const { activeEvents, fsrsInput } = require('../src/app/review_ledger.js');
const event = (id, ms=100) => ({ event_id:id, occurred_at_ms:ms, grade:3 });
const undo = (id,target) => ({ retraction_id:id,target_event_id:target,reason:'undo' });
assert.deepEqual(activeEvents([event('b'),event('a',10)],[]).map(e=>e.event_id),['a','b']);
assert.deepEqual(activeEvents([event('a'),event('b')],[undo('u','a')]).map(e=>e.event_id),['b']);
// Equal-time IDs follow code-unit order, not host-dependent locale collation.
assert.deepEqual(activeEvents([event('a'),event('B')],[]).map(e=>e.event_id),['B','a']);
assert.deepEqual(activeEvents([event('a'),event('a')],[]).length,1);
assert.throws(()=>activeEvents([event('a'),event('a',90)],[]),/Conflicting/);
assert.throws(()=>activeEvents([event('a')],[undo('u','missing')]),/not fetched/);
assert.throws(()=>activeEvents([event('a')],[undo('u','a'),undo('v','a')]),/Conflicting/);
console.log('ok: review ledger, immutable retractions and stable order');

const FSRS = require('../src/fsrs.js');
const provenance = day => ({version:1,algorithm:'fsrs-6',weights:FSRS.DEFAULT_W.slice(),day_index:day});
const a={...event('a'),kind:0,scheduling_provenance:provenance(20000)};
const b={...event('b',200),kind:0,scheduling_provenance:provenance(20001)};
const input1=fsrsInput([b,a],[]);
const input2=fsrsInput([a,b],[]);
assert.deepEqual(input1.reviews,input2.reviews);
assert.deepEqual(FSRS.replay(input1.weights,input1.reviews,input1.clock),
                 FSRS.replay(input2.weights,input2.reviews,input2.clock));
const afterUndo=fsrsInput([b,a],[undo('u','b')]);
assert.deepEqual(FSRS.replay(afterUndo.weights,afterUndo.reviews,afterUndo.clock).mem,
                 FSRS.step(FSRS.DEFAULT_W,null,0,3));
assert.throws(()=>fsrsInput([event('old')],[]),/provenance/);
const changed = {...b,scheduling_provenance:{...provenance(20001),weights:FSRS.DEFAULT_W.map((w,i)=>i===0?w+0.01:w)}};
assert.throws(()=>fsrsInput([a,changed],[]),/parameters changed/);
const reversed = {...b,scheduling_provenance:provenance(19999)};
assert.throws(()=>fsrsInput([a,reversed],[]),/Nonmonotonic/);
const ambiguous = {...b,occurred_at_ms:100,scheduling_provenance:provenance(20001)};
assert.throws(()=>fsrsInput([a,ambiguous],[]),/Ambiguous/);
assert.equal(fsrsInput([],[]).reviews.length,0);
console.log('ok: review ledger adapter delegates to the original FSRS.replay engine');
