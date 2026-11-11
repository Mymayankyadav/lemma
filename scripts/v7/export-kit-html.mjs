// Package the real kit and its React interactions as one offline, mobile-friendly HTML file.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export async function exportKitHtml({ output, fontCss, snapshot, commit }) {
  const temporary = await mkdtemp(join(process.cwd(), '.kit-html-'));
  try {
    await writeFile(join(temporary, 'index.html'), '<html><head></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
    await writeFile(join(temporary, 'entry.tsx'), `
      import React, { useEffect } from 'react';
      import { createRoot } from 'react-dom/client';
      import V7Page from '../src/features/kit/V7Page';
      function Preview() {
        useEffect(() => {
          document.querySelectorAll('details').forEach(item => { item.open = true; });
          const ids = ['principles','colours','emblems','controls','patterns','charts','changelog'];
          document.querySelectorAll('.v7-system-section').forEach((item,index) => { item.id = 'kit-' + ids[index]; });
        }, []);
        return <V7Page/>;
      }
      createRoot(document.getElementById('root')!).render(<Preview/>);
    `);
    const result = await build({
      configFile: false,
      root: temporary,
      base: './',
      plugins: [react()],
      logLevel: 'warn',
      build: {
        write: false,
        cssCodeSplit: false,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        rollupOptions: { input: join(temporary, 'index.html'), output: { inlineDynamicImports: true } },
      },
    });
    const assets = (Array.isArray(result) ? result[0] : result).output;
    const css = assets.filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.css')).map(asset => typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8')).join('\n');
    const javascript = assets.find(asset => asset.type === 'chunk' && asset.isEntry).code;
    const readerCss = `
      html { scroll-behavior:smooth; }
      body { margin:0; }
      .kit-reader-nav { position:sticky;top:0;z-index:100;background:var(--v7-role-surface-page);border-bottom:1px solid var(--v7-role-border-default);display:flex;align-items:center;gap:12px;padding:12px 16px;overflow-x:auto;font:600 14px/20px var(--v7-sans); }
      .kit-reader-nav a,.kit-reader-nav button { flex:none;min-height:44px;display:inline-flex;align-items:center;color:var(--v7-role-link-fg);background:transparent;border:0;text-decoration:none;font:inherit; }
      .v7-system-section { scroll-margin-top:84px; }
      .kit-reader-source { padding:24px 16px;color:var(--v7-role-text-secondary);font:400 12px/20px var(--v7-sans); }
      @media(max-width:699px) {
        html[data-theme="graph"] .v7-split-panel[data-theme="graph-night"],html[data-theme="graph-night"] .v7-split-panel[data-theme="graph"] {display:none;}
      }
      @media(prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
    `;
    const escapeScript = code => code.replace(/<\/script/gi, '<\\/script');
    const html = `<!doctype html>
<html lang="en" data-v7="" data-theme="graph"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>Lemma · Constellation UI kit</title>
<style>${fontCss}\n${css}\n${readerCss}</style></head><body>
<nav class="kit-reader-nav" aria-label="Kit sections"><a href="#kit-controls">Buttons & controls</a><a href="#kit-charts">Charts</a><a href="#kit-patterns">Patterns</a><a href="#kit-emblems">Emblems</a><a href="#kit-colours">Colours & type</a><button type="button" id="kit-reader-theme">Day / Night</button></nav>
<div id="root">${snapshot}</div>
<footer class="kit-reader-source">Offline UI kit preview · ${commit.slice(0,7)} · Styles, fonts and interactions are included in this file.</footer>
<script>${escapeScript(`document.getElementById('kit-reader-theme').onclick=function(){const night=document.documentElement.dataset.theme!=='graph-night';const buttons=document.querySelectorAll('.v7-kit-header .v7-segmented button');const target=buttons[night?1:0];if(target)target.click();document.documentElement.dataset.theme=night?'graph-night':'graph';};`)}</script>
<script type="module">${escapeScript(javascript)}</script>
</body></html>`;
    await writeFile(output, html);
  } finally { await rm(temporary, { recursive:true, force:true }); }
}
