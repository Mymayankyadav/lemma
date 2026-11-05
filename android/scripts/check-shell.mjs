#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = process.argv[2] ? resolve(process.argv[2]) : resolve(fileURLToPath(new URL('../../', import.meta.url)))
const read = path => readFileSync(resolve(root,path),'utf8')
const assert = (condition, message) => { if (!condition) throw Error('N7 shell: '+message) }
const twa = JSON.parse(read('android/twa-manifest.json'))
assert(twa.packageId === 'io.github.mymayankyadav.lemma','wrong package')
assert(twa.host === 'mymayankyadav.github.io' && twa.startUrl === '/lemma/' && twa.scope === '/lemma/','wrong launch URL')
assert(twa.fallbackType === 'customtabs','missing Custom Tabs fallback')
assert(twa.shortcuts?.length === 3 && ['#/review','#/proposals','#/atlas'].every(x=>twa.shortcuts.some(s=>s.url === 'https://mymayankyadav.github.io/lemma/'+x)),'missing shortcut')
const manifest = read('android/app/src/main/AndroidManifest.xml')
assert(manifest.includes('android:name="asset_statements"') && manifest.includes('android:resource="@string/asset_statements"'),'missing asset-links entry')
assert(manifest.includes('android.support.customtabs.trusted.DEFAULT_URL" android:value="https://mymayankyadav.github.io/lemma/"'),'missing launch URL')
assert(manifest.includes('android:host="mymayankyadav.github.io" android:pathPrefix="/lemma/"'),'missing verified app link')
const strings = read('android/app/src/main/res/values/strings.xml')
assert(strings.includes('delegate_permission/common.handle_all_urls') && strings.includes('https://mymayankyadav.github.io'),'missing asset-links declaration')
const gradle = read('android/app/build.gradle')
assert(gradle.includes('androidbrowserhelper:2.7.3') && gradle.includes('io.github.mymayankyadav.lemma'),'wrong Android Browser Helper or namespace')
console.log('N7 Android shell metadata verified')
