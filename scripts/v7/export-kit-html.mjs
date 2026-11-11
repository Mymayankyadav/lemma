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
      html {scroll-behavior:smooth;}
      body {margin:0;}
      .kit-reader-nav {position:sticky;top:0;z-index:100;padding:8px 16px;background:var(--v7-role-surface-page);border-bottom:1px solid var(--v7-role-border-default);color:var(--v7-role-text-primary);font:600 14px/20px var(--v7-sans);}
      .kit-reader-nav summary {min-height:44px;cursor:pointer;display:list-item;align-content:center;}
      .kit-reader-nav > div {display:flex;flex-wrap:wrap;gap:8px 20px;padding:8px 0;}
      .kit-reader-nav a {min-height:44px;display:inline-flex;align-items:center;color:var(--v7-role-link-fg);text-decoration:underline;font:inherit;}
      .v7-system-section {scroll-margin-top:76px;}
      .kit-reader-source {padding:24px 16px;color:var(--v7-role-text-secondary);font:400 12px/20px var(--v7-sans);}
      @media(max-width:699px){html[data-theme="graph"] .v7-split-panel[data-theme="graph-night"],html[data-theme="graph-night"] .v7-split-panel[data-theme="graph"] {display:none;}}
      @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto;}}
    `;
    const escapeScript = code => code.replace(/<\/script/gi, '<\\/script');
    const html = `<!doctype html>
<html lang="en" data-v7="" data-theme="graph"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>Lemma · Constellation UI kit</title>
<style>${fontCss}\n${css}\n${readerCss}</style></head><body>
<details class="kit-reader-nav"><summary>Jump to a kit section</summary><div><a href="#kit-principles">Principles</a><a href="#kit-colours">Colours & type</a><a href="#kit-emblems">Emblems</a><a href="#kit-controls">Buttons & controls</a><a href="#kit-patterns">Patterns</a><a href="#kit-charts">Charts</a><a href="#kit-changelog">Changelog</a></div></details>
<div id="root">${snapshot}</div>
<footer class="kit-reader-source">Offline UI kit preview · ${commit.slice(0,7)} · Styles, fonts and interactions are included in this file.</footer>

<script type="module">${escapeScript(javascript)}</script>
</body></html>`;
    await writeFile(output, html);
  } finally { await rm(temporary, { recursive:true, force:true }); }
}
