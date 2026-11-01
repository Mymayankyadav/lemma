import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig({
 base:'/lemma/',
 plugins:[
  react(),tailwindcss(),
  VitePWA({
   injectRegister:false,
   registerType:'prompt',
   includeAssets:['icons/lemma-192.png','icons/lemma-512.png','icons/lemma-maskable-512.png'],
   manifest:{
    id:'/lemma/',
    name:'Lemma — A Mathematical Study Environment',
    short_name:'Lemma',
    description:'Persistent, proof-first mathematical study with an AI tutor.',
    start_url:'/lemma/',
    scope:'/lemma/',
    display:'standalone',
    theme_color:'#13171D',
    background_color:'#13171D',
    icons:[
     {src:'/lemma/icons/lemma-192.png',sizes:'192x192',type:'image/png'},
     {src:'/lemma/icons/lemma-512.png',sizes:'512x512',type:'image/png'},
     {src:'/lemma/icons/lemma-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
    ],
   },
   workbox:{
    importScripts:['push-sw.js'],
    globPatterns:['**/*.{js,css,html,png,svg,woff2}'],
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
