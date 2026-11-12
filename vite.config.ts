import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {VitePWA} from 'vite-plugin-pwa';
import {FLAG_DEFAULTS,resolveFlags} from './src/flags';
import {shouldBundlePushWorker, shouldStartPushWorker} from './src/lib/push-build-flag';

const allowOverrides = process.env.VITE_ALLOW_FLAG_OVERRIDES === '1';
const pushEnabled = shouldBundlePushWorker(FLAG_DEFAULTS.notificationsPush, allowOverrides);
const pushAutoStart = shouldStartPushWorker(FLAG_DEFAULTS.notificationsPush, allowOverrides, process.env.VITE_FLAGS ?? '');
// Splash and installed-window colours follow the default shell: under v7 the Day paper page, matching the graph-paper
// Notebook icon (D3 = C); under v6 the Graph-night page. Rolling v7Shell back flips these with it.
// The build's own flags decide (production builds ignore overrides, so they follow FLAG_DEFAULTS).
const installColour = resolveFlags({allowOverrides, envFlags: process.env.VITE_FLAGS ?? ''}).v7Shell ? '#F8F5F0' : '#13171D';

export default defineConfig({
 base:'/lemma/',
 plugins:[
  react(),tailwindcss(),
  // URL-only overrides require a distinct SW script URL: query params on the page
  // are not available to the service worker when it first evaluates.
  ...(allowOverrides ? [{
   name: 'lemma-push-query-registration',
   transformIndexHtml() {
    return [{tag:'script',attrs:{src:'/lemma/lemma-push-query.js',defer:true},injectTo:'head' as const}];
   },
   generateBundle() {
    this.emitFile({type:'asset',fileName:'lemma-push-query.js',
     source:readFileSync(new URL('./src/lib/lemma-push-query.js',import.meta.url),'utf8')});
   },
  }] : []),
  ...(pushEnabled ? [{
   name: 'lemma-push-worker-asset',
   generateBundle() {
    this.emitFile({type:'asset',fileName:'lemma-push-worker.js',
     source:`self.__lemmaPushAutoStart=${JSON.stringify(pushAutoStart)};self.__lemmaPushAllowUrlOverride=${JSON.stringify(allowOverrides)};\n`+
      readFileSync(new URL('./src/lib/lemma-push-worker.js', import.meta.url),'utf8')});
   },
  }] : []),
  VitePWA({
   injectRegister:false,
   registerType:'prompt',
   includeAssets:['icons/lemma-192.png','icons/lemma-512.png','icons/lemma-maskable-512.png','icons/apple-touch-icon.png','icons/favicon.svg','icons/favicon-32.png','icons/favicon.ico','icons/shortcut-review.png','icons/shortcut-approve.png','icons/shortcut-atlas.png'],
   manifest:{
    id:'/lemma/',
    name:'Lemma — A Mathematical Study Environment',
    short_name:'Lemma',
    description:'Persistent, proof-first mathematical study with an AI tutor.',
    start_url:'/lemma/',
    scope:'/lemma/',
    display:'standalone',
    display_override:['standalone'],
    launch_handler:{client_mode:'focus-existing'},
    categories:['education','productivity'],
    orientation:'any',
    prefer_related_applications:false,
    shortcuts:[
     {name:'Review',short_name:'Review',url:'/lemma/#/review',icons:[{src:'/lemma/icons/shortcut-review.png',sizes:'96x96',type:'image/png'}]},
     {name:'Approve',short_name:'Approve',url:'/lemma/#/proposals',icons:[{src:'/lemma/icons/shortcut-approve.png',sizes:'96x96',type:'image/png'}]},
     {name:'Atlas',short_name:'Atlas',url:'/lemma/#/atlas',icons:[{src:'/lemma/icons/shortcut-atlas.png',sizes:'96x96',type:'image/png'}]},
    ],
    screenshots:[
     {src:'/lemma/screenshots/today-day-1080x1920.png',sizes:'1080x1920',type:'image/png',form_factor:'narrow',label:'Today · Graph day'},
     {src:'/lemma/screenshots/today-night-1080x1920.png',sizes:'1080x1920',type:'image/png',form_factor:'narrow',label:'Today · Graph night'},
    ],
    theme_color:installColour,
    background_color:installColour,
    icons:[
     {src:'/lemma/icons/lemma-192.png',sizes:'192x192',type:'image/png'},
     {src:'/lemma/icons/lemma-512.png',sizes:'512x512',type:'image/png'},
     {src:'/lemma/icons/lemma-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
    ],
   },
   workbox:{
    ...(pushEnabled ? {importScripts:['/lemma/lemma-push-worker.js']} : {}),
    globPatterns:['**/*.{js,css,html,png,svg,woff2}'],
    // Store-listing screenshots are published for Play/PWA installability,
    // not app runtime. Keep them out of first-install Workbox downloads.
    globIgnores:['**/screenshots/**','**/fonts/v7/**'],
    cleanupOutdatedCaches:true,
    maximumFileSizeToCacheInBytes:4*1024*1024,
    navigateFallback:'/lemma/index.html',
    runtimeCaching:[
     {urlPattern:/^https:\/\/fonts\.googleapis\.com\//,handler:'StaleWhileRevalidate',
      options:{cacheName:'lemma-fonts-css',expiration:{maxEntries:10,maxAgeSeconds:60*60*24*365}}},
     {urlPattern:/^https:\/\/fonts\.gstatic\.com\//,handler:'CacheFirst',
      options:{cacheName:'lemma-fonts-files',cacheableResponse:{statuses:[0,200]},
       expiration:{maxEntries:30,maxAgeSeconds:60*60*24*365}}},
    ],
   },
  }),
 ],
});
