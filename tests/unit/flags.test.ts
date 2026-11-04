import {describe,expect,it} from 'vitest'
import {FLAG_DEFAULTS,resolveFlags,isFlagOn} from '../../src/flags'

describe('feature flags',()=>{
 it('every flag is off by default',()=>{
  expect(Object.values(FLAG_DEFAULTS).every(v=>v===false)).toBe(true)
  expect(resolveFlags({allowOverrides:true})).toEqual(FLAG_DEFAULTS)
 })
 it('?flags=a,b and the env variable turn known flags on when overrides are allowed',()=>{
  expect(resolveFlags({allowOverrides:true,search:'?demo=1&flags=ciSelfTest'}).ciSelfTest).toBe(true)
  expect(resolveFlags({allowOverrides:true,envFlags:' ciSelfTest , nope'}).ciSelfTest).toBe(true)
 })
 it('ignores unknown names and never enables anything in production',()=>{
  expect(resolveFlags({allowOverrides:true,search:'?flags=doesNotExist'})).toEqual(FLAG_DEFAULTS)
  expect(resolveFlags({allowOverrides:false,search:'?flags=ciSelfTest',envFlags:'ciSelfTest'})).toEqual(FLAG_DEFAULTS)
 })
 it('isFlagOn reads the live environment (test mode allows overrides, no query -> off)',()=>{
  expect(isFlagOn('ciSelfTest')).toBe(false)
 })
})
