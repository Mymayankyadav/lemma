#!/usr/bin/env node
/** AND-3 fail-closed shell contract (run before Gradle in Android CI). */
import { readFile, stat } from 'node:fs/promises'
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
ensure(/minSdk\s+23/.test(gradle), 'minSdk 23 required')
ensure(/targetSdk\s+(3[5-9]|[4-9]\d)/.test(gradle), 'targetSdk must be 35 or newer')
ensure(gradle.includes('androidbrowserhelper:2.7.3'), 'pin latest minSdk-23-compatible Android Browser Helper 2.7.3')
ensure(await exists('android/gradlew') && await exists('android/gradle/wrapper/gradle-wrapper.jar'),
  'Gradle wrapper required')
ensure(await exists('android/app/src/main/res/drawable/ic_stat_lemma.xml'),
  'monochrome notification glyph required')
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
const ignore = await get('.gitignore')
for (const forbidden of ['*.jks', '*.keystore', 'android/local.properties', 'google-services.json']) {
  ensure(ignore.includes(forbidden), '.gitignore missing ' + forbidden)
}
console.log('AND-3 shell contracts verified (static checks; Gradle/CI still required)')
