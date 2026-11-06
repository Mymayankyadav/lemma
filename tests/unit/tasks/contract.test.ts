import {describe,expect,it} from 'vitest'
import {emptyTaskApi,TaskNotImplemented,type TaskRecord} from '../../../src/data/tasks/contract'
import {getTaskApi,setTaskApiForTests} from '../../../src/data/tasks'

describe('v6 task contract placeholder',()=>{
 it('reads nothing and refuses writes until an adapter lands',async()=>{
  const api=emptyTaskApi('demo')
  expect(await api.listTasks()).toEqual({items:[],total:0,nextCursor:null})
  expect(await api.getTask('t1')).toBeNull()
  await expect(api.createTask({title:'x'})).rejects.toBeInstanceOf(TaskNotImplemented)
  await expect(api.deleteTask('t',1)).rejects.toThrow('deleteTask')
 })
 it('getTaskApi returns a test fake when set',()=>{
  const fake=emptyTaskApi('live')
  setTaskApiForTests(fake)
  expect(getTaskApi()).toBe(fake)
  setTaskApiForTests(null)
 })
 it('a TaskRecord keeps due date and due instant distinct',()=>{
  const base:Omit<TaskRecord,'due'>={id:'t1',title:'Read 2.3',body:'',estimateMinutes:30,priority:'normal',position:0,status:'backlog',completedAt:null,version:1,createdAt:'2026-11-06T09:00:00Z',updatedAt:'2026-11-06T09:00:00Z'}
  const byDate:TaskRecord={...base,due:{kind:'date',date:'2026-11-09'}}
  const byInstant:TaskRecord={...base,due:{kind:'instant',at:'2026-11-09T17:00:00Z'}}
  expect(byDate.due.kind).not.toBe(byInstant.due.kind)
 })
})
