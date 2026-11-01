import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isStandalone, isTwa, pushSupport } from '../../../src/lib/platform'

const originalReferrer = document.referrer
const originalPushManager = Object.getOwnPropertyDescriptor(window, 'PushManager')
const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification')
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')

function setReferrer(referrer: string) {
  Object.defineProperty(document, 'referrer', { configurable: true, value: referrer })
}
function setPermission(permission: NotificationPermission) {
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } })
}
function setSupport(enabled: boolean) {
  if (enabled) {
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
  } else {
    Reflect.deleteProperty(window, 'PushManager')
  }
}
function restore(target: object, key: string, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}

beforeEach(() => { window.sessionStorage.clear(); setReferrer(''); setSupport(true); setPermission('default') })
afterEach(() => {
  window.sessionStorage.clear()
  setReferrer(originalReferrer)
  restore(window, 'PushManager', originalPushManager)
  restore(window, 'Notification', originalNotification)
  restore(navigator, 'serviceWorker', originalServiceWorker)
  restore(window, 'matchMedia', originalMatchMedia)
  vi.restoreAllMocks()
})

describe('Android TWA detection', () => {
  it('detects the first Android app referrer and remembers it across navigations', () => {
    setReferrer('android-app://io.github.mymayankyadav.lemma/')
    expect(isTwa()).toBe(true)
    setReferrer('')
    expect(isTwa()).toBe(true)
  })
  it('does not mistake a normal browser or a similarly prefixed package for the TWA', () => {
    expect(isTwa()).toBe(false)
    setReferrer('android-app://io.github.mymayankyadav.lemma.evil/')
    expect(isTwa()).toBe(false)
  })
  it('does not persist the signal across separate visits', () => {
    setReferrer('android-app://io.github.mymayankyadav.lemma')
    expect(isTwa()).toBe(true)
    window.sessionStorage.clear()
    setReferrer('')
    expect(isTwa()).toBe(false)
  })
})

describe('platform capability detection', () => {
  it('detects display-mode standalone', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn().mockReturnValue({matches:true}) })
    expect(isStandalone()).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith('(display-mode: standalone)')
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn().mockReturnValue({matches:false}) })
    expect(isStandalone()).toBe(false)
  })
  it.each(['granted', 'default'] as const)('allows a permission request when %s', permission => {
    setPermission(permission)
    expect(pushSupport()).toBe('yes')
  })
  it('reports denied permission as blocked', () => {
    setPermission('denied')
    expect(pushSupport()).toBe('blocked')
  })
  it('reports missing PushManager as unsupported', () => {
    setSupport(false)
    expect(pushSupport()).toBe('unsupported')
  })
  it('reports missing service worker or Notifications as unsupported', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker')
    expect(pushSupport()).toBe('unsupported')
    setSupport(true)
    Reflect.deleteProperty(window, 'Notification')
    expect(pushSupport()).toBe('unsupported')
  })
})


describe('Digital Asset Links template',()=>{
 it('has the exact package, relation, and two unfilled public fingerprint placeholders',()=>{
  const json=JSON.parse(readFileSync('docs/android/assetlinks.template.json','utf8'))
  expect(json).toHaveLength(1)
  expect(json[0].relation).toEqual(['delegate_permission/common.handle_all_urls'])
  expect(json[0].target.namespace).toBe('android_app')
  expect(json[0].target.package_name).toBe('io.github.mymayankyadav.lemma')
  expect(json[0].target.sha256_cert_fingerprints).toEqual([
   '<FINGERPRINT_PLAY_APP_SIGNING>','<FINGERPRINT_UPLOAD_CERTIFICATE>',
  ])
 })
})
