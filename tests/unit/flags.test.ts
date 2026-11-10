import {describe,expect,it} from 'vitest'
import {FLAG_DEFAULTS,resolveFlags,isFlagOn,resolveEffectiveShell,currentEffectiveShell} from '../../src/flags'
import {setShellRoot} from '../../src/app/shellRoot'

describe('feature flags',()=>{
 it('every flag except v6Shell is off by default (v6Shell turned on by N102)',()=>{
  const {v6Shell,...rest}=FLAG_DEFAULTS
  expect(v6Shell).toBe(true)
  expect(Object.values(rest).every(v=>v===false)).toBe(true)
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
 it('v6Shell is on by default; only development/test overrides can turn it off',()=>{
  expect(FLAG_DEFAULTS.v6Shell).toBe(true)
  expect(resolveFlags({allowOverrides:true}).v6Shell).toBe(true)
  expect(resolveFlags({allowOverrides:true,search:'?flags=-v6Shell'}).v6Shell).toBe(false)
  expect(resolveFlags({allowOverrides:true,envFlags:'-v6Shell'}).v6Shell).toBe(false)
  // The URL wins over the build-time env, so a legacy e2e build can still opt a page back in.
  expect(resolveFlags({allowOverrides:true,envFlags:'-v6Shell',search:'?flags=v6Shell'}).v6Shell).toBe(true)
  // Production never honours an override in either direction: rolling back is a reviewed default change.
  expect(resolveFlags({allowOverrides:false,search:'?flags=-v6Shell',envFlags:'-v6Shell'}).v6Shell).toBe(true)
 })
 it('a leading - turns a known flag off and is ignored for unknown names',()=>{
  expect(resolveFlags({allowOverrides:true,search:'?flags=-ciSelfTest,-nope'})).toEqual(FLAG_DEFAULTS)
  expect(resolveFlags({allowOverrides:true,search:'?flags=ciSelfTest,-ciSelfTest'}).ciSelfTest).toBe(false)
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
 it('selects v7 before v6 before legacy without changing raw flag values',()=>{
  for (const [v7Shell,v6Shell,shell] of [[true,true,'v7'],[true,false,'v7'],[false,true,'v6'],[false,false,'legacy']] as const) {
   const flags=resolveFlags({allowOverrides:true,envFlags:`${v7Shell?'':'-'}v7Shell,${v6Shell?'':'-'}v6Shell`})
   expect(resolveEffectiveShell(flags)).toBe(shell)
   expect(flags.v6Shell).toBe(v6Shell)
   expect(flags.v7Shell).toBe(v7Shell)
  }
  expect(resolveFlags({allowOverrides:true,envFlags:'-v6Shell,-v7Shell',search:'?flags=v6Shell,v7Shell'})).toMatchObject({v6Shell:true,v7Shell:true})
  expect(resolveFlags({allowOverrides:false,envFlags:'v7Shell',search:'?flags=v7Shell'}).v7Shell).toBe(false)
  expect(currentEffectiveShell()).toBe('v6')
 })
 it('sets mutually exclusive root attributes including for portal descendants',()=>{
  const root=document.createElement('html'),body=document.createElement('body'),portal=document.createElement('div')
  root.append(body); body.append(portal)
  setShellRoot('v6',root)
  expect(portal.closest('[data-v6]')).toBe(root)
  expect(root.hasAttribute('data-v7')).toBe(false)
  setShellRoot('v7',root)
  expect(portal.closest('[data-v7]')).toBe(root)
  expect(root.hasAttribute('data-v6')).toBe(false)
  setShellRoot('legacy',root)
  expect(root.hasAttribute('data-v6')).toBe(false)
  expect(root.hasAttribute('data-v7')).toBe(false)
 })
 it('allows test URL overrides to supersede the test environment',()=>{
  const original=window.location.href
  try {
   window.history.replaceState({},'', '/?flags=v7Shell')
   expect(isFlagOn('v7Shell')).toBe(true)
   expect(currentEffectiveShell()).toBe('v7')
   window.history.replaceState({},'', '/?flags=-v6Shell,-v7Shell')
   expect(currentEffectiveShell()).toBe('legacy')
   window.history.replaceState({},'', '/?flags=v6Shell')
   expect(currentEffectiveShell()).toBe('v6')
  } finally {window.history.replaceState({},'',original)}
 })
})
