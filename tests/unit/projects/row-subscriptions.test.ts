import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {countPinnedProjects} from '../../../src/features/projects/pinnedCount'

describe('LOOK-5a bounded Paths row subscriptions',()=>{
 it('counts only real non-archived pinned projects for the four-pin guard',()=>{
  const projects=[
   {pinned:true,system:false,status:'active'},
   {pinned:true,system:false,status:'planning'},
   {pinned:true,system:false,status:'paused'},
   {pinned:true,system:false,status:'done'},
   {pinned:true,system:false,status:'archived'},
   {pinned:true,system:true,status:'active'},
   {pinned:false,system:false,status:'active'},
  ] as const
  expect(countPinnedProjects(projects)).toBe(4)
  expect(countPinnedProjects([...projects,{pinned:true,system:false,status:'active'}])).toBe(5)
 })
 it('subscribes to the project query once per Paths page, not once per row',()=>{
  const source=readFileSync(join(process.cwd(),'src/features/projects/Page.tsx'),'utf8')
  expect(source.match(/\buseProjects\(\)/g)?.length).toBe(1)
  expect(source).toContain('pinnedCount={pinnedCount}')
 })
})
