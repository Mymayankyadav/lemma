import {spawn, execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {openScene, shots, redesignShots} from '../../tests/e2e/v7-scenes.ts';
import {measureV7Design} from '../../tests/e2e/helpers/v7-design.ts';

const output = resolve(process.env.LEMMA_UI_AUDIT_OUTPUT ?? 'artifacts/ui-audit');
const address = process.env.LEMMA_UI_AUDIT_URL ?? 'http://127.0.0.1:4177';
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], {encoding:'utf8'}).trim());
const scenes = [...new Map([...shots, ...redesignShots].map(shot => [shot.name, shot])).values()];
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
  for (const shot of scenes.filter(scene => !selected.length || selected.includes(scene.name))) {
    const page = await browser.newPage({baseURL:address,deviceScaleFactor:2,locale:'en-IN',timezoneId:'Asia/Kolkata'});
    try {
      await openScene(page, shot, 'dark', {width:390,height:844});
      const name = shot.name + '.png';
      await page.screenshot({path:join(output,name),animations:'disabled'});
      frames.push({scene:shot.name,file:name,account:shot.demo ?? 'populated',facts:await page.evaluate(measureV7Design)});
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
} finally {
  await browser?.close();
  server?.kill();
}
