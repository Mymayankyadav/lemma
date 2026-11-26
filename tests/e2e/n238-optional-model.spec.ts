import {readFileSync, writeFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';

test('installs and removes an explicitly chosen FP16 package through Writing assistance', async ({page,context})=>{
  const source=process.env.LEMMA_ANDROID_PACK;
  const reference=process.env.LEMMA_ANDROID_REFERENCE;
  test.setTimeout(source?1_800_000:90_000);
  const route='/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch,typeaheadV2,writingAidSettings&typeahead-arm=neural&typeahead-graph-trial=1&typeahead-strict-trial=1&typeahead-replay=1#/p/real-analysis/cp/CP4/tutor';
  const downloads:string[]=[];
  page.on('request',request=>{if (/(?:weights\.bin|\.lemmapack|prefill\.onnx|incremental\.onnx)/u.test(request.url())) downloads.push(request.url());});
  const open=async()=>{
    await page.goto(route);
    const write=page.getByRole('button',{name:'Write a question',exact:true});
    const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
    await expect(write.or(answer).filter({visible:true}).first()).toBeVisible();
    if (!await answer.isVisible()) {
      try {await write.click({timeout:2000});} catch (error) {if (!await answer.isVisible()) throw error;}
    }
    await expect(answer).toBeVisible();await answer.focus();
  };
  const settings=async()=>{
    await page.getByRole('button',{name:'Session actions',exact:true}).click();
    await page.getByRole('button',{name:'Writing assistance',exact:true}).click();
    return page.getByRole('dialog',{name:'Writing assistance',exact:true});
  };
  await open();await page.keyboard.type('Use the ');
  const dialog=await settings();
  await expect(dialog.getByText(/68,193,934 bytes/)).toBeVisible();
  expect(downloads).toEqual([]);
  if (!source) return;
  await dialog.locator('input[type=file]').setInputFiles(source);
  await expect(dialog.getByRole('button',{name:'Remove model'})).toBeVisible({timeout:90_000});
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.reload();
  await open();await page.keyboard.type('Please restate the ');
  const rows=reference?JSON.parse(readFileSync(reference,'utf8')) as {ids:number[];top:number[];group:string;stablePrefix?:number;previousIds?:number[]}[]:[];
  const outcomes=[];
  for(const [i,row] of rows.entries()){
    const observed=await page.evaluate(input=>new Promise<{top:number[];cachedTop?:number[];retokenizedTop?:number[];prefillMs:number;decodeMs?:number;provider:string}>((resolve,reject)=>{
      const receive=(event:Event)=>{const value=(event as CustomEvent).detail;if(value.labId!==input.labId)return;
        clearTimeout(timer);window.removeEventListener('lemma-typeahead-lab-result',receive);resolve(value);};
      const timer=setTimeout(()=>{window.removeEventListener('lemma-typeahead-lab-result',receive);reject(new Error('No diagnostic reply from installed worker'));},45000);
      window.addEventListener('lemma-typeahead-lab-result',receive);window.dispatchEvent(new CustomEvent('lemma-typeahead-lab-case',{detail:input}));
    }),{labId:String(i),ids:row.ids,stablePrefix:row.stablePrefix,previousIds:row.previousIds});
    expect(observed.top).toHaveLength(3);
    const matches=(top:number[]|undefined)=>top?.toSorted().join()===row.top.toSorted().join();
    outcomes.push({group:row.group,length:row.ids.length,provider:observed.provider,prefillMs:observed.prefillMs,decodeMs:observed.decodeMs,
      native:matches(observed.top),cache:row.ids.length===1||matches(observed.cachedTop),revision:!row.previousIds||matches(observed.retokenizedTop)});
  }
  if(process.env.LEMMA_ANDROID_RESULT)writeFileSync(process.env.LEMMA_ANDROID_RESULT,JSON.stringify(outcomes));
  await context.setOffline(true);
  try {
    const installed=await settings();
    await expect(installed.getByRole('button',{name:'Remove model'})).toBeVisible();
    await installed.getByRole('button',{name:'Remove model'}).click();
    await expect(installed.getByLabel('Install model file')).toBeVisible();
  } finally {await context.setOffline(false);}
  expect(downloads).toEqual([]);
});
