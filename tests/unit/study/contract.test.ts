import {describe,expect,it} from 'vitest'
import {emptyStudyApi,StudyNotImplemented,type StudyEntryRecord} from '../../../src/data/study/contract'
import {getStudyApi,setStudyApiForTests} from '../../../src/data/study'
import {loggedMinutes} from '../../../src/lib/effort'

describe('v6 study contract placeholder',()=>{
 it('reads nothing and refuses writes until an adapter lands',async()=>{
  const api=emptyStudyApi('demo')
  expect(await api.listStudyEntries({start:'2026-11-06T00:00:00Z',end:'2026-11-07T00:00:00Z'})).toEqual([])
  expect(await api.activeStudyEntry()).toBeNull()
  expect(await api.listCalendarBlocks({start:'2026-11-06T00:00:00Z',end:'2026-11-07T00:00:00Z'})).toEqual([])
  await expect(api.startStudyEntry({intent:'x',source:'timer'})).rejects.toBeInstanceOf(StudyNotImplemented)
  await expect(api.deleteCalendarBlock('b',1)).rejects.toThrow('deleteCalendarBlock')
 })
 it('getStudyApi returns a test fake when set',()=>{
  const fake=emptyStudyApi('live')
  setStudyApiForTests(fake)
  expect(getStudyApi()).toBe(fake)
  setStudyApiForTests(null)
 })
 it('a StudyEntryRecord feeds the effort metrics directly',()=>{
  const e:StudyEntryRecord={id:'e1',intent:'x',source:'timer',status:'saved',reflection:null,rating:null,version:2,createdAt:'2026-11-06T09:00:00Z',updatedAt:'2026-11-06T10:00:00Z',savedAt:'2026-11-06T10:00:00Z',
   intervals:[{id:'i1',kind:'focus',start:'2026-11-06T09:00:00Z',end:'2026-11-06T09:30:00Z'}]}
  const entries=[{...e,intervals:e.intervals.map((i)=>({start:i.start,end:i.end as string,kind:i.kind}))}]
  expect(loggedMinutes(entries,{start:'2026-11-06T00:00:00Z',end:'2026-11-07T00:00:00Z'},'UTC','2026-11-06T12:00:00Z').minutes).toBe(30)
 })
})
