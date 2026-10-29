import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const path=name=>resolve(process.cwd(),'dist',name);
const required=['manifest.webmanifest','sw.js','icons/lemma-192.png','icons/lemma-512.png','icons/lemma-maskable-512.png'];
for(const file of required)if(!existsSync(path(file)))throw Error('Missing PWA release artifact: '+file);
const manifest=JSON.parse(readFileSync(path('manifest.webmanifest'),'utf8'));
if(manifest.display!=='standalone'||manifest.start_url!=='/lemma/'||manifest.scope!=='/lemma/')
 throw Error('PWA manifest scope or launch settings incorrect');
for(const [name,size] of [['lemma-192.png',192],['lemma-512.png',512],['lemma-maskable-512.png',512]]){
 const image=readFileSync(path('icons/'+name));
 if(image.toString('hex',0,8)!=='89504e470d0a1a0a'||image.readUInt32BE(16)!==size||image.readUInt32BE(20)!==size)
  throw Error('PWA icon corrupt or wrong dimensions: '+name);
}
if(!manifest.icons.some(icon=>icon.purpose==='maskable')||!manifest.icons.some(icon=>icon.sizes==='192x192'))
 throw Error('PWA manifest is missing installable icons: '+JSON.stringify(manifest.icons));
const index=readFileSync(path('index.html'),'utf8');
if(!index.includes('manifest.webmanifest'))throw Error('HTML does not link the PWA manifest');
const worker=readFileSync(path('sw.js'),'utf8');
if(!worker.includes('lemma')||!worker.includes('precache'))throw Error('Workbox offline asset cache missing');
console.log('PWA release artifacts verified: manifest, service worker, 192/512/maskable icons');
