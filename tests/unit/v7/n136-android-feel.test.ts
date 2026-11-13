import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {wantsBackHandler} from '../../../src/platform/links';
import {whenRootPainted} from '../../../src/platform/splash';

// N136 · v7 UX audit r3, AN3: two Android "feel" fixes that need no decision (AW7, AW8).
describe('AW8 · Android plays its back-to-home preview on Today',()=>{
 it('Lemma takes back only when something is open or it is not on Today',()=>{
  expect(wantsBackHandler({layerOpen:false,route:'/'})).toBe(false);
  expect(wantsBackHandler({layerOpen:false,route:'/?quick=1'})).toBe(false);
  expect(wantsBackHandler({layerOpen:true,route:'/'})).toBe(true);
  expect(wantsBackHandler({layerOpen:false,route:'/review'})).toBe(true);
  expect(wantsBackHandler({layerOpen:false,route:''})).toBe(false);
 });
 it('the app follows routes and layers with toggleBackButtonHandler',()=>{
  const start=readFileSync('src/platform/start.ts','utf8');
  expect(start).toContain('App.toggleBackButtonHandler({enabled: wanted})');
  expect(start).toContain("window.addEventListener('hashchange', queueBack)");
 });
});
describe('AW8 · back on Today leaves Lemma running on every Android version',()=>{
 it('below Android 12 a fallback under the App plugin moves the task to the back',()=>{
  const activity=readFileSync('android/app/src/main/java/io/github/mymayankyadav/lemma/MainActivity.java','utf8');
  expect(activity).toContain('if (BackPolicy.systemLeavesRunning(Build.VERSION.SDK_INT)) return;');
  expect(activity).toMatch(/getOnBackPressedDispatcher\(\)\.addCallback\(new OnBackPressedCallback\(true\)[\s\S]*moveTaskToBack\(true\)/);
  expect(activity.indexOf('keepRunningOnBack();')).toBeGreaterThan(activity.indexOf('super.onCreate(savedInstanceState);'));
 });
});
describe('AW7 · the splash lifts on the first paint (cap 800 ms)',()=>{
 it('waits for the root to have content',async()=>{
  const root=document.createElement('div');
  document.body.append(root);
  let painted=0;
  whenRootPainted(root,()=>{painted++;});
  root.append(document.createTextNode('text only'));
  await Promise.resolve();
  expect(painted).toBe(0);
  root.append(document.createElement('main'));
  await Promise.resolve();
  expect(painted).toBe(1);
  root.append(document.createElement('div'));
  await Promise.resolve();
  expect(painted).toBe(1);
  root.remove();
 });
 it('the static web splash in index.html (and its style) is not the first paint; React\'s content is',async()=>{
  const root=document.createElement('div');
  const splash=document.createElement('div');splash.className='lemma-splash';
  root.append(splash,document.createElement('style'));
  document.body.append(root);
  let painted=0;
  whenRootPainted(root,()=>{painted++;});
  await Promise.resolve();
  expect(painted).toBe(0);
  // React's first commit clears the placeholder and draws the app.
  root.replaceChildren(document.createElement('main'));
  await Promise.resolve();
  expect(painted).toBe(1);
  root.remove();
  expect(readFileSync('index.html','utf8')).toMatch(/<div id="root">[\s\S]*class="lemma-splash"/);
 });
 it('releases at once when the root already has content, and when there is no root',()=>{
  const root=document.createElement('div');
  root.append(document.createElement('main'));
  let painted=0;
  whenRootPainted(root,()=>{painted++;});
  whenRootPainted(null,()=>{painted++;});
  expect(painted).toBe(2);
 });
 it('a cancelled wait never releases',async()=>{
  const root=document.createElement('div');
  document.body.append(root);
  let painted=0;
  whenRootPainted(root,()=>{painted++;})();
  root.append(document.createElement('main'));
  await Promise.resolve();
  expect(painted).toBe(0);
  root.remove();
 });
 it('the app hides the splash through it; the plugin\'s 800 ms auto-hide stays the cap',()=>{
  const start=readFileSync('src/platform/start.ts','utf8');
  expect(start).toContain("whenRootPainted(document.getElementById('root'), () => void splash.then(plugin => plugin?.SplashScreen.hide())");
  expect(start).not.toContain("then(({SplashScreen}) => SplashScreen.hide())");
  const config=JSON.parse(readFileSync('capacitor.config.json','utf8'));
  expect(config.plugins.SplashScreen).toMatchObject({launchAutoHide:true,launchShowDuration:800});
 });
});
describe('AW7 · the WebView has the page colour before the page paints',()=>{
 it('set at start and when the system theme changes, from the Day/Night resource',()=>{
  const activity=readFileSync('android/app/src/main/java/io/github/mymayankyadav/lemma/MainActivity.java','utf8');
  expect(activity).toContain('getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.lemma_paper))');
  expect(activity.match(/applyPaper\(\);/g)).toHaveLength(2);
  expect(readFileSync('android/app/src/main/res/values/colors.xml','utf8')).toContain('<color name="lemma_paper">#F8F5F0</color>');
  expect(readFileSync('android/app/src/main/res/values-night/colors.xml','utf8')).toContain('<color name="lemma_paper">#091023</color>');
  expect(readFileSync('android/app/src/main/AndroidManifest.xml','utf8')).toMatch(/configChanges="[^"]*uiMode/);
 });
});
