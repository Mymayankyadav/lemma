import {spawn, execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {openScene, shots, redesignShots} from '../../tests/e2e/v7-scenes.ts';
import {enableSurfaceBeta} from '../../tests/e2e/helpers/surface-preview.ts';
import {auditAppendixC} from './appendix-c-audit.mjs';
import {measureV7Design} from '../../tests/e2e/helpers/v7-design.ts';

const output = resolve(process.env.LEMMA_UI_AUDIT_OUTPUT ?? 'artifacts/ui-audit');
const address = process.env.LEMMA_UI_AUDIT_URL ?? 'http://127.0.0.1:4177';
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], {encoding:'utf8'}).trim());
const scenes = [...new Map([...shots, ...redesignShots].map(shot => [shot.name, shot])).values()];
const compact = {width:390,height:844}, wide = {width:1440,height:900};
const paletteScenes = [
  {name:'controls',hash:'/kit',size:wide,prepare:page=>page.getByRole('region',{name:'Components and states'}).scrollIntoViewIfNeeded()},
  {name:'settings',hash:'/settings?section=study&advanced=1',size:compact,prepare:page=>page.getByRole('region',{name:'Focus preferences',exact:true}).scrollIntoViewIfNeeded()},
  {name:'tutor-rules',hash:'/settings?section=tutor',size:compact,prepare:async page=>{
    await page.getByRole('button',{name:'Tutor rules',exact:true}).click();
    await page.getByRole('dialog',{name:'Tutor rules',exact:true}).waitFor();
  }},
  {name:'picker',hash:'/tasks?new=1',size:wide,prepare:async page=>{
    await page.getByRole('dialog',{name:'New task',exact:true}).getByRole('button',{name:/^Due:/}).click();
    await page.getByRole('listbox',{name:'Due',exact:true}).waitFor();
  }},
];
const captures = [
  ...scenes.map(shot=>({shot,scheme:'dark',size:compact})),
  ...['light','dark'].flatMap(scheme=>paletteScenes.map(scene=>({
    shot:{...scene,name:'palette-'+scene.name+'-'+(scheme==='light'?'day':'night')},scheme,size:scene.size,beta:true,
  }))),
];
const selected = process.argv.slice(2);
const frames = [];
let server;
let browser;

try {
  if (!process.env.LEMMA_UI_AUDIT_URL) {
    execFileSync('npm', ['run','build'], {stdio:'inherit', env:{...process.env,VITE_ALLOW_FLAG_OVERRIDES:'1'}});
    server = spawn('node', ['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4177','--strictPort'], {stdio:'inherit'});
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) throw new Error('UI audit preview exited');
      if (await fetch(address + '/lemma/').then(response=>response.ok).catch(()=>false)) break;
      if (attempt === 49) throw new Error('UI audit preview did not start');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  await mkdir(output, {recursive:true});
  browser = await chromium.launch({executablePath:process.env.LEMMA_CHROMIUM});
  if (selected[0] === '--appendix-c') {
    const result = await auditAppendixC(browser,address,selected.slice(1));
    const report = join(output,'appendix-c-contrast.json');
    const method = 'Computed colors on representative rendered control/surface pairs, composited through flat backgrounds. '
      + 'Text requires 4.5:1 and checked control boundaries require 3:1. High contrast activates the kit token profile. '
      + 'Measurements exclude gradients, images, graphics, and states outside the selected pairs.';
    await writeFile(report,JSON.stringify({sourceCommit,dirty,method,...result},null,2)+'\n');
    const failures = result.runs.flatMap(run=>[
      ...(run.error?[{profile:run.profile,scene:run.scene,error:run.error}]:[]),
      ...run.modules.flatMap(module=>[
        ...(module.error?[{profile:run.profile,scene:run.scene,module:module.module,error:module.error}]:[]),
        ...module.pairs.filter(pair=>!pair.passes).map(pair=>({profile:run.profile,scene:run.scene,...pair})),
      ]),
    ]);
    for (const failure of failures) console.error(JSON.stringify(failure));
    console.log(`Audited ${result.runs.length} scene/profile combinations. Report: ${report}`);
    if(failures.length||!result.runs.length)process.exitCode=1;
  } else {
    for (const {shot,scheme,size,beta} of captures.filter(({shot})=>!selected.length||selected.includes(shot.name))) {
      const page = await browser.newPage({baseURL:address,deviceScaleFactor:2,locale:'en-IN',timezoneId:'Asia/Kolkata'});
      try {
        if(beta)await enableSurfaceBeta(page);
        await openScene(page,shot,scheme,size);
        const name = shot.name + '.png';
        await page.screenshot({path:join(output,name),animations:'disabled'});
        frames.push({scene:shot.name,file:name,account:shot.demo ?? 'populated',scheme,viewport:[size.width,size.height],facts:await page.evaluate(measureV7Design)});
      } catch (error) {
        frames.push({scene:shot.name,error:String(error)});
      } finally {
        await page.close();
      }
    }
    await writeFile(join(output,'manifest.json'), JSON.stringify({sourceCommit,dirty,viewport:[390,844],frames},null,2)+'\n');
    const failed = frames.filter(frame=>frame.error);
    console.log(`Captured ${frames.length - failed.length} scenes in ${output}.`);
    if (failed.length || !frames.length) {
      for (const {scene,error} of failed) console.error(scene,error);
      process.exitCode = 1;
    }
  }
} finally {
  await browser?.close();
  server?.kill();
}
