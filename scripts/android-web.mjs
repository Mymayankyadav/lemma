/**
 * N123 · after `vite build --mode android --outDir dist-android/lemma`: Capacitor serves dist-android at
 * https://localhost/ and starts at /lemma/ (capacitor.config.json appStartPath), answering that path with the root
 * index.html. Copy the page there so every /lemma/… asset URL resolves exactly as on the website.
 */
import {copyFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';

const root=join(process.cwd(),'dist-android'),page=join(root,'lemma','index.html');
if(!existsSync(page)){console.error('dist-android/lemma/index.html is missing: run vite build --mode android first');process.exit(1);}
copyFileSync(page,join(root,'index.html'));
// Store-listing screenshots are for the web manifest and Play, not the app: keep them out of the APK.
rmSync(join(root,'lemma','screenshots'),{recursive:true,force:true});
console.log('Prepared dist-android for Capacitor');
