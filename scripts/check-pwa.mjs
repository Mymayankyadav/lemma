import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {inflateSync} from 'node:zlib';

const path=name=>resolve(process.cwd(),'dist',name);
const required=['manifest.webmanifest','sw.js','icons/lemma-192.png','icons/lemma-512.png','icons/lemma-maskable-512.png','icons/shortcut-review.png','icons/shortcut-approve.png','icons/shortcut-atlas.png','screenshots/today-day-1080x1920.png','screenshots/today-night-1080x1920.png'];
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
// Store-listing PNGs are available at their manifest URLs, but must not be
// downloaded into the offline app cache during a cold Today first paint.
if(/screenshots\\?\/today-(?:day|night)-1080x1920\.png/.test(worker))
 throw Error('Store-listing screenshots must not be Workbox precache entries');
console.log('PWA release artifacts verified: manifest, service worker, 192/512/maskable icons');

const expectedShortcuts={Review:'#/review',Approve:'#/proposals',Atlas:'#/atlas'};
if(JSON.stringify(manifest.display_override)!==JSON.stringify(['standalone'])||
 manifest.launch_handler?.client_mode!=='focus-existing'||manifest.orientation!=='any'||
 manifest.prefer_related_applications!==false||
 !['education','productivity'].every(category=>manifest.categories?.includes(category)))
 throw Error('Android install-quality manifest fields missing');
for(const [name,hash] of Object.entries(expectedShortcuts)){
 const shortcut=manifest.shortcuts?.find(item=>item.name===name);
 if(!shortcut||shortcut.url!=='/lemma/'+hash)throw Error('Invalid launcher shortcut: '+name);
 const icon=shortcut.icons?.find(item=>item.sizes==='96x96'&&item.type==='image/png');
 if(!icon||!icon.src.startsWith('/lemma/icons/shortcut-'))throw Error('Missing 96px shortcut icon: '+name);
 const filename=icon.src.replace(/^\/lemma\//,'');
 if(!existsSync(path(filename)))throw Error('Shortcut icon not packaged: '+filename);
 const bytes=readFileSync(path(filename));
 if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==96||bytes.readUInt32BE(20)!==96)
  throw Error('Invalid shortcut icon dimensions: '+filename);
}
if(!index.includes('media="(prefers-color-scheme: light)" content="#FAFAF6"')||
 !index.includes('media="(prefers-color-scheme: dark)" content="#13171D"'))
 throw Error('Missing Graph day/night theme-color variants');

/** AND-1 screenshot gate: real 360px phone captures at 3× DPR, committed
 * and declared. Missing metadata or files fail the release build closed.
 */
{
 if(!Array.isArray(manifest.screenshots)||manifest.screenshots.length!==2)
  throw Error('Android install screenshots must contain day and night captures');
 const sources=new Set();
 for(const shot of manifest.screenshots){
  if(shot.form_factor!=='narrow'||shot.type!=='image/png'||shot.sizes!=='1080x1920'||!shot.src?.startsWith('/lemma/screenshots/'))
   throw Error('Invalid Android install screenshot metadata');
  if(sources.has(shot.src))throw Error('Duplicate Android install screenshot');
  sources.add(shot.src);
  const filename=shot.src.replace(/^\/lemma\//,'');
  if(!existsSync(path(filename)))throw Error('Missing Android install screenshot: '+filename);
  const png=readFileSync(path(filename));
  if(png.toString('hex',0,8)!=='89504e470d0a1a0a'||
   png.readUInt32BE(16)!==1080||png.readUInt32BE(20)!==1920)
   throw Error('Android install screenshot must be 1080x1920: '+filename);
 }
 if(!sources.has('/lemma/screenshots/today-day-1080x1920.png')||
    !sources.has('/lemma/screenshots/today-night-1080x1920.png'))
  throw Error('Android install screenshot day/night pair is incomplete');
}


/** NOTIF-5: verify push worker import and monochrome badge alongside Android install gates. */
const push=readFileSync(path('push-sw.js'),'utf8');
if(!push.includes("addEventListener('push'")||!push.includes("addEventListener('notificationclick'"))
 throw Error('Notification worker event handlers missing');
if(!worker.includes('push-sw.js'))throw Error('Workbox must import the push handler without replacing the update prompt');
const core=readFileSync(path('push-sw-core.js'),'utf8');
const sourceCore=readFileSync(resolve(process.cwd(),'src/lib/push-sw-core.js'),'utf8');
if(core!==sourceCore)throw Error('Service worker core differs from the unit-tested source');
const badge=readFileSync(path('icons/badge-96.png'));
if(badge.toString('hex',0,8)!=='89504e470d0a1a0a'||badge.readUInt32BE(16)!==96||badge.readUInt32BE(20)!==96)
 throw Error('Notification badge is not a 96px PNG');
let offset=8;const idat=[];
while(offset<badge.length){
 const length=badge.readUInt32BE(offset),type=badge.toString('ascii',offset+4,offset+8);
 if(type==='IDAT')idat.push(badge.subarray(offset+8,offset+8+length));
 offset+=12+length;
}
const rgba=inflateSync(Buffer.concat(idat));
let visible=0,transparent=0;
for(let y=0;y<96;y++){
 const row=y*(96*4+1);
 if(rgba[row]!==0)throw Error('Badge generator changed PNG filter');
 for(let x=0;x<96;x++){
  const at=row+1+x*4,alpha=rgba[at+3];
  if(alpha===0){transparent++;continue;}
  visible++;
  if(rgba[at]!==255||rgba[at+1]!==255||rgba[at+2]!==255)
   throw Error('Notification badge must be monochrome white');
 }
}
if(!visible||!transparent)throw Error('Notification badge must have a transparent background and visible glyph');
console.log('NOTIF-5 Workbox import, identical core and monochrome 96px badge verified');
