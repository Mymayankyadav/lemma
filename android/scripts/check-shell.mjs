#!/usr/bin/env node
/** AND-3 fail-closed shell contract (run before Gradle in Android CI). */
import { readFile, stat } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const get = async path => readFile(resolve(root, path), 'utf8')
const exists = async path => { try { await stat(resolve(root, path)); return true } catch { return false } }
const ensure = (ok, message) => { if (!ok) throw Error('AND-3: ' + message) }

const twa = JSON.parse(await get('android/twa-manifest.json'))
ensure(twa.packageId === 'io.github.mymayankyadav.lemma', 'packageId mismatch')
ensure(twa.host === 'mymayankyadav.github.io' && twa.startUrl === '/lemma/', 'TWA launch scope mismatch')
ensure(twa.fallbackType === 'customtabs', 'unverified links must fall back to Custom Tabs')
ensure(twa.enableNotifications === true, 'notification delegation must be enabled')
ensure(Array.isArray(twa.shortcuts) && twa.shortcuts.length === 3, 'three launcher shortcuts required')
ensure(['#/review', '#/proposals', '#/atlas'].every(x => twa.shortcuts.some(s => s.url.endsWith(x))),
  'Review, Approve and Atlas shortcuts required')

const manifest = await get('android/app/src/main/AndroidManifest.xml')
for (const required of [
  'https', 'mymayankyadav.github.io',
  '/lemma/', 'asset_statements', 'LauncherActivity', 'DelegationService',
  'android.support.customtabs.trusted.DEFAULT_URL', 'android.support.customtabs.trusted.FALLBACK_STRATEGY',
  'customtabs', 'android.support.customtabs.trusted.ENABLE_NOTIFICATION_DELEGATION',
  'lemma-widget', 'android.intent.action.VIEW',
]) ensure(manifest.includes(required), 'manifest missing ' + required)
const gradle = await get('android/app/build.gradle')
ensure(gradle.includes('io.github.mymayankyadav.lemma'), 'applicationId/namespace mismatch')
ensure(gradle.includes("versionCode = Integer.parseInt(System.getenv('GITHUB_RUN_NUMBER') ?: '1')"),
  'versionCode must safely parse CI run number with a local fallback')
ensure(/minSdk\s+23/.test(gradle), 'minSdk 23 required')
ensure(/targetSdk\s+(3[5-9]|[4-9]\d)/.test(gradle), 'targetSdk must be 35 or newer')
ensure(gradle.includes('androidbrowserhelper:2.7.3'), 'pin latest minSdk-23-compatible Android Browser Helper 2.7.3')
ensure(await exists('android/gradlew') && await exists('android/gradle/wrapper/gradle-wrapper.jar'),
  'Gradle wrapper required')
ensure(await exists('android/app/src/main/res/drawable/ic_stat_lemma.xml'),
  'monochrome notification glyph required')
// Regression-first AND-3 delegated notification and launcher shortcut acceptance.
const delegatedService = manifest.match(/<service\b[^>]*android:name="com\.google\.androidbrowserhelper\.trusted\.DelegationService"[^>]*>([\s\S]*?)<\/service>/)?.[1]
ensure(delegatedService &&
  /<meta-data\b[^>]*android:name="android\.support\.customtabs\.trusted\.SMALL_ICON"\s+android:resource="@drawable\/ic_stat_lemma"\s*\/>/.test(delegatedService),
  'DelegationService must associate the monochrome SMALL_ICON metadata with ic_stat_lemma')

const shortcutsXml = await get('android/app/src/main/res/xml/shortcuts.xml')
const shortcutEntries = [...shortcutsXml.matchAll(/<shortcut\b([^>]+)>([\s\S]*?)<\/shortcut>/g)]
const expectedShortcutUrls = {
  review: 'https://mymayankyadav.github.io/lemma/#/review',
  approve: 'https://mymayankyadav.github.io/lemma/#/proposals',
  atlas: 'https://mymayankyadav.github.io/lemma/#/atlas',
}
ensure(shortcutEntries.length === 3, 'exactly three Android shortcuts required')
// PNG dimensions alone are insufficient: AAPT2 rejects corrupt IDAT/CRC data.
const pngCrc32 = bytes => {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xEDB88320)
  }
  return (crc ^ -1) >>> 0
}
const validShortcutPng = png => {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false
  if (png.length < 45 || png.readUInt32BE(16) !== 96 || png.readUInt32BE(20) !== 96) return false
  let offset = 8, sawHeader = false, sawEnd = false
  const compressed = []
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset), end = offset + 12 + length
    if (end > png.length) return false
    const kind = png.toString('ascii', offset + 4, offset + 8)
    const body = png.subarray(offset + 4, offset + 8 + length)
    if (pngCrc32(body) !== png.readUInt32BE(offset + 8 + length)) return false
    if (kind === 'IHDR') sawHeader = length === 13 && png[offset + 25] === 6
    if (kind === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length))
    offset = end
    if (kind === 'IEND') { sawEnd = length === 0; break }
  }
  if (!sawHeader || !sawEnd || offset !== png.length || !compressed.length) return false
  try { return inflateSync(Buffer.concat(compressed)).length === 96 * (96 * 4 + 1) }
  catch { return false }
}
const iconReferences = new Set()
const iconContents = new Set()
for (const [kind, url] of Object.entries(expectedShortcutUrls)) {
  const shortcut = shortcutEntries.find(([, attributes]) => attributes.includes('android:shortcutId="' + kind + '"'))
  ensure(shortcut, 'missing Android shortcut ' + kind)
  const attributes = shortcut[1]
  const expectedIcon = '@drawable/shortcut_' + kind
  ensure(attributes.includes('android:icon="' + expectedIcon + '"'),
    'Android ' + kind + ' shortcut must use its own glyph')
  ensure(shortcut[2].includes('android:data="' + url + '"'),
    'Android ' + kind + ' shortcut deep link mismatch')
  iconReferences.add(expectedIcon)
  const pngPath = 'android/app/src/main/res/drawable-nodpi/shortcut_' + kind + '.png'
  ensure(await exists(pngPath), 'missing Android 96px shortcut glyph ' + kind)
  const png = await readFile(resolve(root, pngPath))
  ensure(validShortcutPng(png),
    'Android shortcut glyph must be an intact 96x96 RGBA PNG: ' + kind)
  iconContents.add(png.toString('base64'))
}
ensure(iconReferences.size === 3 && iconContents.size === 3,
  'Review, Approve and Atlas must have three distinct Android glyphs')

const splash = await get('android/app/src/main/res/drawable/ic_launcher.xml')
ensure(splash.includes('@color/paper') && splash.includes('@color/ink'),
  'splash glyph and background must use day/night resource colours')
const workflow = await get('.github/workflows/android.yml')
for (const required of ['workflow_dispatch:', 'android-v*', 'lint', 'bundleRelease',
  'ANDROID_UPLOAD_KEYSTORE_BASE64', 'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
  'ANDROID_UPLOAD_KEY_ALIAS', 'ANDROID_UPLOAD_KEY_PASSWORD', 'upload-artifact']) {
  ensure(workflow.includes(required), 'Android workflow missing ' + required)
}
ensure(!/packages:\s*['\"]?tools\b/.test(workflow), 'obsolete Android SDK tools package is not installable')
ensure(workflow.includes("packages: 'platform-tools'"), 'setup-android must avoid removed tools package')
ensure(/- name: Configure optional release signing\n\s+if: github\.event_name != 'pull_request'/.test(workflow),
  'PR builds must never receive signing secrets')
const ignore = await get('.gitignore')
for (const forbidden of ['*.jks', '*.keystore', 'android/local.properties', 'google-services.json']) {
  ensure(ignore.includes(forbidden), '.gitignore missing ' + forbidden)
}
console.log('AND-3 shell contracts verified (static checks; Gradle/CI still required)')
