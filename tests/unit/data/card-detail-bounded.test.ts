import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,expect,it} from 'vitest'

const source=readFileSync(resolve(process.cwd(),'src/data/live/adapter.ts'),'utf8')
const getCard=source.split(' async getCard(')[1]?.split(' async createNote(')[0]??''
const history=source.split(' async getCardHistoryPage(')[1]?.split(' async getCardCommentsPage(')[0]??''
const comments=source.split(' async getCardCommentsPage(')[1]?.split(' async updateSubject(')[0]??''

describe('FIX-546a/b bounded Card detail owner reads',()=>{
 it('never downloads full owner tables and delegates initial histories to bounded page methods',()=>{
  for(const section of [getCard,history,comments])expect(section).not.toMatch(/\brows\(db\s*,/)
  expect(getCard).toContain(".eq('note_id',note.id)")
  expect(getCard).toContain('this.getCardHistoryPage(no)')
  expect(getCard).toContain('this.getCardCommentsPage(no)')
  expect(history).toContain(".in('card_id',cards.map(c=>c.id))")
  expect(comments).toContain(".in('id',ids)")
  expect(history).toContain('.limit(21)')
  expect(comments).toContain('.limit(21)')
 })
 it('keeps every Card detail query owner-scoped and metadata keyed by referenced IDs',()=>{
  for(const section of [getCard,history,comments])expect(section).toContain(".eq('user_id',uid)")
  expect(getCard).toContain(".eq('id',note.project_id)")
  expect(getCard).toContain(".eq('id',note.checkpoint_id)")
  expect(getCard).toContain(".eq('id',note.session_id)")
  expect(getCard).toContain(".eq('id',note.source_id)")
  expect(history).toContain(".eq('note_id',note.id)")
  expect(comments).toContain(".eq('note_id',note.id)")
 })
})
