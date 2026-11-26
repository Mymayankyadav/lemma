import {afterEach,describe,expect,it,vi} from 'vitest'
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url',()=>({default:'worker'}))
import {DemoAdapter} from '../../../src/data/demo/adapter'

// N251 regression: the demo adapter's Home used getExamApi(), which follows the page's `?demo=` mode, so a
// DemoAdapter outside demo mode (tests, stress fixtures) reached for the live client and failed with
// "Lemma Supabase configuration is missing". It now reads the demo exam store whatever the mode.
describe('demo Home exam block',()=>{
 afterEach(()=>{window.history.replaceState(null,'','/')})
 it('builds the v7 exam block from the demo store outside ?demo=',async()=>{
  window.history.replaceState(null,'','/?flags=v7Shell')
  const home=await new DemoAdapter().getHome()
  expect(home.exam?.sittings.map(sitting=>sitting.title)).toEqual(expect.arrayContaining(['Linear Algebra midterm']))
 })
 it('leaves the exam block out of the other shells, which have no screen for it',async()=>{
  window.history.replaceState(null,'','/?flags=-v7Shell')
  expect((await new DemoAdapter().getHome()).exam).toBeUndefined()
 })
})
