// @vitest-environment node
import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {isColdScreenRoute} from '../../../src/ui/Screen'

describe('FIX #507 cold document Screen entrance',()=>{
 it('skips redundant 600ms nested entrance only for the initial hash route',()=>{
  expect(isColdScreenRoute('#/','#/')).toBe(true)
  expect(isColdScreenRoute('','#/')).toBe(true)
  expect(isColdScreenRoute('#/projects','#/projects')).toBe(true)
  expect(isColdScreenRoute('#/projects','#/settings')).toBe(false)
  expect(isColdScreenRoute('#/review','#/cards')).toBe(false)
 })
 it('retains animated Screen variants on subsequent SPA routes',()=>{
  const screen=readFileSync('src/ui/Screen.tsx','utf8')
  expect(screen).toContain('initial={skipColdEntrance?false:"hidden"}')
  expect(screen).toContain('variants={variantFor(rise,reduce)}')
 })
})
