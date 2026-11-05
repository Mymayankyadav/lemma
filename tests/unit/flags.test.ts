import {describe,expect,it} from 'vitest'
import {FLAG_DEFAULTS,resolveFlags,isFlagOn} from '../../src/flags'

describe('feature flags',()=>{
 it('every flag is off by default',()=>{
  expect(Object.values(FLAG_DEFAULTS).every(v=>v===false)).toBe(true)
  expect(resolveFlags({allowOverrides:true})).toEqual(FLAG_DEFAULTS)
 })
 it('androidShell is off by default and cannot be enabled in production',()=>{
  expect(FLAG_DEFAULTS.androidShell).toBe(false)
  expect(resolveFlags({allowOverrides:true,search:'?flags=androidShell'}).androidShell).toBe(true)
  expect(resolveFlags({allowOverrides:false,search:'?flags=androidShell',envFlags:'androidShell'}).androidShell).toBe(false)
 })
 it('notificationsPush is off by default and only enabled through permitted overrides',()=>{
  expect(FLAG_DEFAULTS.notificationsPush).toBe(false)
  expect(resolveFlags({allowOverrides:true,search:'?flags=notificationsPush'}).notificationsPush).toBe(true)
  expect(resolveFlags({allowOverrides:false,search:'?flags=notificationsPush'}).notificationsPush).toBe(false)
 })
 it('v6Shell is off by default and only accepts development/test overrides',()=>{
  expect(FLAG_DEFAULTS.v6Shell).toBe(false)
  expect(resolveFlags({allowOverrides:true,search:'?flags=v6Shell'}).v6Shell).toBe(true)
  expect(resolveFlags({allowOverrides:false,search:'?flags=v6Shell',envFlags:'v6Shell'}).v6Shell).toBe(false)
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
