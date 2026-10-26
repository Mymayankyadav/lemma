// Assemble dist/index.html and dist/lemma.html: inline app CSS, KaTeX CSS with embedded woff2 fonts, and all scripts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSync } = require('esbuild');
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const katexDir = path.join(root, 'node_modules/katex/dist');
let katexCss = fs.readFileSync(path.join(katexDir, 'katex.min.css'), 'utf8');
katexCss = katexCss.replace(/src:url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\),url\(fonts\/[\w-]+\.woff\) format\("woff"\),url\(fonts\/[\w-]+\.ttf\) format\("truetype"\)/g,
  (m, name) => `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(katexDir, 'fonts', name + '.woff2')).toString('base64')}) format("woff2")`);
if (/url\(fonts\//.test(katexCss)) throw new Error('unreplaced KaTeX font url');

const appFiles = ['util.js', 'sync_merge.js', 'outbox_core.js', 'sync_browser.js', 'store.js', 'model.js', 'session.js', 'charts.js', 'io.js', 'ai.js', 'jobs.js',
  'view_review.js', 'view_editor.js', 'view_browse.js', 'view_home.js', 'view_stats.js', 'view_settings.js', 'sheets.js', 'main.js'];
const app = "(() => {\n'use strict';\n" + appFiles.map((f) => `/* ===== ${f} ===== */\n` + read('src/app/' + f)).join('\n') + '\n})();';

// All runtime libraries are embedded, including Supabase, for an offline-capable Android WebView.
const guard = (s) => {
  if (/<\/script/i.test(s)) throw new Error('script contains </script');
  return s;
};
const vendor = (pkgPath) => guard(read(pkgPath));
const supabaseJs = buildSync({
  stdin: {
    contents: "import { createClient } from '@supabase/supabase-js'; window.LemmaSupabase = { createClient };",
    resolveDir: root,
    sourcefile: 'supabase-entry.js',
    loader: 'js',
  }, bundle: true, minify: true, platform: 'browser', format: 'iife',
  write: false, logLevel: 'silent',
}).outputFiles[0].text;
const config = Object.freeze({
  url: process.env.SUPABASE_URL || '',
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
});
const configScript = read('src/config.js').replace('/*@@CONFIG_VALUE@@*/',
  JSON.stringify(config).replace(/</g, '\\u003c'));
const webBoot = `if ('serviceWorker' in navigator && location.protocol === 'https:' &&
  !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}`;
let html = read('src/index.html');
const parts = {
  '/*@@APP_CSS@@*/': read('src/app.css'),
  '/*@@KATEX_CSS@@*/': katexCss,
  '/*@@KATEX_JS@@*/': vendor('node_modules/katex/dist/katex.min.js'),
  '/*@@MARKED_JS@@*/': vendor('node_modules/marked/lib/marked.umd.js'),
  '/*@@PURIFY_JS@@*/': vendor('node_modules/dompurify/dist/purify.min.js'),
  '/*@@SUPABASE_JS@@*/': guard(supabaseJs),
  '/*@@CONFIG@@*/': guard(configScript),
  '/*@@FSRS@@*/': guard(read('src/fsrs.js')),
  '/*@@RENDER@@*/': guard(read('src/render.js')),
  '/*@@APP@@*/': guard(app),
  '/*@@WEB_BOOT@@*/': guard(webBoot),
};
for (const [k, v] of Object.entries(parts)) {
  if (!html.includes(k)) throw new Error('missing placeholder ' + k);
  html = html.split(k).join(v);
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/lemma.html'), html);
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
fs.writeFileSync(path.join(root, 'dist/test.html'), html);
const version = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
const serviceWorker = read('src/service-worker.js').replaceAll('@@BUILD_VERSION@@', version);
fs.writeFileSync(path.join(root, 'dist/service-worker.js'), serviceWorker);
for (const file of ['manifest.webmanifest', 'icons/icon.svg']) {
  const target = path.join(root, 'dist', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'src', file), target);
}
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log('dist/index.html', kb(Buffer.byteLength(html)), '| title:', html.includes('<title>'));
