import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

/** The first online visit must become an offline-capable controlled PWA. */
describe('FIX #751 first-visit PWA client control',()=>{
 it('claims a newly activated worker without silently forcing prompt-mode updates',()=>{
  const config=readFileSync('vite.config.ts','utf8')
  expect(config).toMatch(/registerType:\s*'prompt'/)
  expect(config).toMatch(/workbox:\s*\{[\s\S]*?\bclientsClaim:\s*true\b/)
  // A waiting update must still require the user's explicit Update action.
  expect(config).not.toMatch(/\bskipWaiting:\s*true\b/)
 })
})
