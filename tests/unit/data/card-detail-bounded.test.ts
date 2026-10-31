import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const source=readFileSync(resolve(process.cwd(),'src/data/live/adapter.ts'),'utf8');
const getCard=source.split('  async getCard(')[1]?.split('  async createNote(')[0]??'';

describe('FIX-546a bounded Card detail owner reads',()=>{
 it('does not download any complete owner table for one selected card',()=>{
  expect(getCard).not.toMatch(/\\brows\\(db\\s*,/);
  expect(getCard).toContain(".eq('note_id',note.id)");
  expect(getCard).toContain(".in('card_id',cardIds)");
  expect(getCard).toContain(".in('id',proposalIds)");
 });
 it('keeps every Card detail query owner-scoped and metadata keyed by referenced IDs',()=>{
  expect(getCard).toContain(".eq('user_id',uid)");
  expect(getCard).toContain(".eq('id',note.project_id)");
  expect(getCard).toContain(".eq('id',note.checkpoint_id)");
  expect(getCard).toContain(".eq('id',note.session_id)");
  expect(getCard).toContain(".eq('id',note.source_id)");
 });
});
