import {catalog as previous, FLAGS} from './approval-catalog.mjs';
import {redesignShots,DATE} from '../../tests/e2e/v7-scenes.ts';

// The old interaction catalog remains the inventory. These adapters follow controls
// into their new menus; they never treat a missing control as a successful capture.
export {FLAGS};
export const baseline=process.env.LEMMA_PARITY_BASELINE==='1';
export const click=async(page,name)=>page.getByRole('button',{name,exact:true}).or(page.getByRole('menuitem',{name,exact:true})).or(page.getByRole('radio',{name,exact:true})).first().click();
const chain=(...steps)=>async page=>{for(const step of steps)await step(page);};
const tap=name=>page=>click(page,name);
const matching=(page,name)=>page.getByRole('button',{name}).first().click();
const round=async page=>{await matching(page,/^(Start review|Start \d+ cards?|Resume)/);await page.getByRole('button',{name:'Show answer',exact:true}).waitFor();};
const source=async page=>page.getByRole('region',{name:'Sources',exact:true}).getByRole('button',{name:/Rudin/i}).first().click();
const layers=async page=>click(page,'Layers');
const subset=name=>baseline?tap(name):chain(layers,tap(name),tap('Close'));
const selectConcept=async page=>page.locator('.v7-atlas-subject li button,.v7-room-atlas-subject li button').filter({hasText:'Compactness'}).first().click();
const filter=async page=>click(page,'Filter');
const moreTask=async page=>{if(!baseline)await matching(page,/^More options$|^More ·/);};
const moreBlock=async page=>{if(!baseline)await click(page,'More');};
const due=label=>baseline?tap(label):chain(async page=>matching(page,/^Due:/),tap(label));

const focusStart=async page=>{await matching(page,/^(Start now|Start focus)$/);await page.waitForURL(/#\/focus/);await page.getByRole('button',{name:'Pause',exact:true}).waitFor();};
const elapsed=async page=>{await page.clock.setFixedTime(new Date('2026-11-09T13:45:00+05:30'));await page.waitForTimeout(1100);};
const overrides={
 'capture-sheet':chain(tap('Capture'),async page=>page.getByRole('dialog',{name:'Capture',exact:true}).getByRole('textbox').first().waitFor()),
 'search-sheet':chain(async page=>page.keyboard.press('Control+k'),async page=>page.getByRole('combobox',{name:'Search',exact:true}).waitFor()),
 'search-results':chain(async page=>page.keyboard.press('Control+k'),async page=>{
   await page.getByRole('combobox',{name:'Search',exact:true}).fill('compact');
   await page.getByRole('region',{name:'Cards',exact:true}).waitFor();
   await page.getByRole('region',{name:'Sources',exact:true}).waitFor();
 }),
 'focus-paused':chain(focusStart,elapsed,tap('Pause'),async page=>page.getByRole('button',{name:'Resume',exact:true}).waitFor()),
 'focus-break':chain(focusStart,elapsed,tap('Take a break'),async page=>page.locator('.v7-focus[data-word="Break"]').waitFor()),
 'focus-log-session':chain(focusStart,elapsed,tap('Finish'),async page=>page.getByRole('dialog',{name:/Log (this )?session/}).waitFor()),
 'focus-desk-clock':chain(focusStart,tap('Timer details'),tap('Desk clock'),async page=>{
   await page.locator('.v7-focus[data-desk]').waitFor();
   if(!baseline)await page.getByRole('textbox',{name:'Park a thought',exact:true}).waitFor({state:'hidden'});
 }),
 'review-round':round,
 'review-answer':chain(round,tap('Show answer')),
 'review-scratch-paper':chain(round,tap('Scratch paper'),async page=>page.getByLabel('Type an attempt').fill('Choose a neighbourhood inside every open set.')),
 'review-scratch-revealed':chain(round,tap('Scratch paper'),async page=>page.getByLabel('Type an attempt').fill('Take the minimum of finitely many radii.'),tap('Show answer')),
 'review-complete':async page=>{await round(page);for(let i=0;i<35&&!page.url().includes('/review/done');i++){
   await click(page,'Show answer');await page.getByRole('group',{name:'Grade answer'}).getByRole('button',{name:/^Easy\b/}).click();
   await page.waitForTimeout(100);
  }await page.waitForURL(/#\/review\/done/);await page.getByRole('region',{name:'Round statistics',exact:true}).waitFor();},
 'practice-record':chain(tap('Practice Proof techniques'),async page=>page.getByRole('dialog',{name:'Practice: Proof techniques',exact:true}).waitFor()),
 'new-task-filled':async page=>{await page.getByLabel('Title',{exact:true}).fill('Prove the finite subcover lemma');
   if(baseline)await page.getByLabel('Estimate · minutes').fill('35');else{await moreTask(page);await page.getByRole('slider',{name:/Estimate/}).press('ArrowRight');}},
 'task-path-filter':chain(...(baseline?[]:[filter]),tap('All paths')),
 'calendar-edit-time':async page=>{if(baseline){await page.getByLabel('Start',{exact:true}).fill('09:15');await page.getByLabel('End',{exact:true}).focus();}
   else await page.getByRole('slider',{name:/^Start/}).press('ArrowRight');},
 'calendar-path-picker':chain(moreBlock,async page=>matching(page,/^Path:/)),
 'calendar-task-picker':chain(moreBlock,async page=>matching(page,/^Task:/)),
 'cards-picker-path':chain(...(baseline?[]:[filter]),tap('Path')),
 'cards-picker-state':chain(...(baseline?[]:[filter]),tap('State')),
 'cards-picker-due-first':chain(...(baseline?[]:[filter]),tap('Due first')),
 'cards-empty-search':async page=>{
   await page.getByLabel('Search cards',{exact:true}).fill('nothing matches this exact query 9841');
   await page.getByText(/No cards match/, {exact:false}).waitFor();
 },
 'capture-type-picker':async page=>{
   await page.getByRole('button',{name:'Capture',exact:true}).focus();
   await page.keyboard.press('ContextMenu');
   await page.getByRole('group',{name:'Choose a type',exact:true}).waitFor();
 },
 'atlas-legend':baseline?tap('Legend'):layers,
 'atlas-tonight':subset('Tonight'),'atlas-shaky':subset('Shaky'),'atlas-demonstrated':subset('Demonstrated'),
 'atlas-concept':selectConcept,
 'atlas-concept-expanded':baseline?chain(selectConcept,tap('Show neighbours and actions')):selectConcept,
 'atlas-edit-concept':chain(selectConcept,...(baseline?[tap('Show neighbours and actions')]:[]),tap('Edit concept')),
 'atlas-preview-concept':chain(selectConcept,...(baseline?[tap('Show neighbours and actions')]:[]),tap('Preview edits')),
 'atlas-pin-concept':chain(selectConcept,...(baseline?[tap('Show neighbours and actions')]:[]),tap('Pin on map')),
 'day-closed':async page=>{if(await page.getByRole('button',{name:'Next',exact:true}).count()){await click(page,'Next');await click(page,'Next');}await matching(page,/^Close the day/);},
 'new-task-due-date':due('Date'),'new-task-due-time':due('Date & time'),
 'new-task-date-picker':chain(due('Date'),async page=>matching(page,/^Due date:/)),
 'new-task-time-picker':chain(due('Date & time'),async page=>{if(baseline)await matching(page,/^Due time[, :]/);else await click(page,'Type due time');}),
 'new-task-subject-picker':chain(moreTask,async page=>matching(page,/^Subject:/)),
};
const base=previous.filter(scene=>!scene.name.startsWith('android-')&&!scene.name.startsWith('large-text-')&&scene.name!=='focus-desk-clock-landscape');
export const catalog=base.map(scene=>({...scene,prepare:overrides[scene.name]??scene.prepare}));
for(const name of ['plan-proposal','path-marked-done']){
 const scene=catalog.find(item=>item.name===name),prepare=scene.prepare;
 scene.prepare=chain(prepare,async page=>page.getByRole('heading',{name:name==='plan-proposal'?'What changes':'Real Analysis',exact:true}).first().waitFor());
}
const add=(name,hash,prepare,extra={})=>catalog.push({name,hash,prepare,...extra});

if(!baseline){
 add('atlas-options-collapsed','/atlas',tap('Hide options'));
 add('atlas-list-options-collapsed','/atlas?view=list',tap('Hide options'));
}

if(!baseline)add('card-delete-undo','/cards/1',chain(tap('More card actions'),tap('Delete card'),async page=>{
 await page.getByRole('dialog',{name:'Delete this card?',exact:true})
  .getByRole('button',{name:'Delete card',exact:true}).click();
 await page.waitForURL(url=>url.hash==='#/cards');
 const undo=page.getByRole('status').filter({hasText:'Card deleted'}).getByRole('button',{name:'Undo',exact:true});
 await undo.waitFor();
 await undo.focus();
}));

add('path-goal','/p/real-analysis',baseline?undefined:async page=>matching(page,/^Prove the main/));
add('path-estimates','/p/real-analysis',baseline?undefined:tap('Plan estimates'));
add('source-pages','/p/real-analysis?tab=sources',baseline?tap('View pages'):source);
add('source-management','/p/real-analysis?tab=sources',baseline?undefined:tap('Manage sources'));
add('progress-details','/insights',baseline?undefined:chain(tap('Progress actions'),tap('Progress details')));
add('progress-empty-range','/insights?range=day');
add('progress-goal','/insights',baseline?undefined:chain(tap('Progress actions'),tap('Add a goal')));
add('study-details','/',baseline?undefined:tap('Study details'));
add('adaptive-practice','/practice?question=1');
add('settings-advanced','/settings?section=advanced');
const atlasEdit=async(page,mode,label)=>{
 await selectConcept(page);if(baseline)await click(page,'Show neighbours and actions');await click(page,'Edit concept');
 if(baseline)await page.getByLabel('Atlas edit operation').selectOption(mode);
 else{await matching(page,/^Action:/);await page.getByRole('radio',{name:label,exact:true}).or(page.getByRole('option',{name:label,exact:true})).click();}
};
for(const [mode,label] of [['reparent','Change parent'],['link','Add link'],['unlink','Remove link'],['merge','Merge into another concept']]){
 add('atlas-operation-'+mode,'/atlas?view=list',async page=>{
  await atlasEdit(page,mode,label);
  if(mode==='merge'){
   if(baseline)await page.getByLabel('Atlas target concept').selectOption({label:'Finite subcover lemma'});
   else{await matching(page,/^Keep this concept:/);await page.getByRole('radio',{name:'Finite subcover lemma',exact:true}).or(page.getByRole('option',{name:'Finite subcover lemma',exact:true})).click();}
   await click(page,'Preview merge impact');await page.getByRole('region',{name:'Server merge impact',exact:true}).waitFor();
  }
 });
}
add('atlas-create-filled','/atlas?view=list',chain(tap('New concept'),async page=>{
 await page.getByLabel('Atlas idea name').fill('Neighbourhood lemma');
 await page.getByLabel('Atlas idea description').fill('Every point has an open neighbourhood.');
}));
if(!baseline){
 for(const scene of redesignShots)if(!catalog.some(item=>item.name===scene.name))catalog.push(scene);
 add('calendar-actions','/calendar?view=day&date='+DATE,tap('Calendar actions'));
 add('calendar-jump-date','/calendar?view=day&date='+DATE,chain(tap('Calendar actions'),tap('Choose date')));
 add('calendar-browse-day','/calendar?view=day&date='+DATE,chain(tap('Calendar actions'),tap('Browse day')));
 add('review-empty-details','/review',chain(tap('Review actions'),tap('Forecast and memory')),{demo:'first-use'});
 add('atlas-subjects','/atlas',chain(layers,tap('Jump to subject')));
}

// This transcript is a demo fixture entered through manual reply import.
export async function conversation(page){
 await matching(page,/^Begin/);
 await click(page,'Session actions');await click(page,baseline?'Tutor connection':'Connection');
 await page.getByLabel('Paste reply',{exact:true}).fill('The finite subcover gives you finitely many neighbourhoods.\n\nWhy is their intersection still a neighbourhood of the point?');
 await click(page,'Preview import');await click(page,'Confirm import');await click(page,'Close');
}
const tutor='/p/real-analysis/cp/CP4/tutor';
const openSymbols=baseline?tap('Symbols'):chain(async page=>page.getByRole('textbox',{name:'Your answer'}).click(),tap('Maths symbols'));
add('tutor-conversation',tutor,conversation);
add('tutor-keyboard',tutor,chain(conversation,async page=>{await page.getByRole('textbox',{name:'Your answer'}).fill('A finite intersection of open sets is open.');await page.getByRole('textbox',{name:'Your answer'}).click();}),{flags:'tutorScratch'});
add('tutor-symbol-keyboard',tutor,chain(conversation,openSymbols),{flags:'tutorScratch'});
if(baseline)add('tutor-device-keyboard',tutor,chain(conversation,async page=>page.getByRole('textbox',{name:'Your answer'}).click(),tap('Use device keyboard')),{flags:'tutorScratch',reducedViewport:true});
add('tutor-context',tutor,baseline?chain(tap('Write a question'),tap('Context')):chain(tap('Write a question'),tap('Session actions'),async page=>page.getByRole('dialog',{name:'Study session'}).getByRole('button',{name:'Context',exact:true}).click()));
add('tutor-connection',tutor,chain(conversation,tap('Session actions'),tap(baseline?'Tutor connection':'Connection')));
add('tutor-session-actions',tutor,chain(conversation,tap('Session actions')));
if(!baseline)add('tutor-edit-answer',tutor,chain(conversation,async page=>page.getByRole('textbox',{name:'Your answer'}).fill('Choose the minimum radius.'),tap('Edit answer')),{flags:'tutorScratch'});
for(const category of ['Greek','Analysis','Phrases'])add('tutor-symbols-'+category.toLowerCase(),tutor,chain(conversation,openSymbols,async page=>page.getByRole('group',{name:'Math categories'}).getByRole('button',{name:category,exact:true}).click()),{flags:'tutorScratch'});
if(!baseline){
 const flags={flags:'tutorScratch'};
 const answer=page=>page.getByRole('textbox',{name:'Your answer',exact:true});
 const chips=page=>answer(page).locator('[data-image-id]');
 const board=page=>page.getByRole('group',{name:'Answer keyboard',exact:true});
 const openAnswer=async page=>{await answer(page).click();await board(page).waitFor();};
 const initialAnswer=chain(tap('Write a question'),openAnswer);
 add('tutor-keyboard-initial',tutor,initialAnswer,flags);
 add('tutor-presence-tooltip',tutor,chain(conversation,async page=>{
  await page.locator('.tutor-header').getByRole('button',{name:/^Tutor status:/}).click();
  await page.getByRole('tooltip').waitFor();
 }),flags);

 const sketch=points=>async page=>{
  const paper=page.getByRole('img',{name:'Draw your answer',exact:true});
  await paper.waitFor();
  const box=await paper.evaluate(node=>{
   const ink=node.getBoundingClientRect(),pane=node.closest('.tutor-scratch-paper').getBoundingClientRect();
   const x=Math.max(ink.left,pane.left,0),y=Math.max(ink.top,pane.top,0);
   return {x,y,width:Math.min(ink.right,pane.right,innerWidth)-x,height:Math.min(ink.bottom,pane.bottom,innerHeight)-y};
  });
  if(!box)throw new Error('Scratch drawing surface is unavailable');
  const [[x,y],...rest]=points;
  await page.mouse.move(box.x+x*box.width,box.y+y*box.height);
  await page.mouse.down();
  for(const [x,y] of rest)await page.mouse.move(box.x+x*box.width,box.y+y*box.height,{steps:8});
  await page.mouse.up();
 };
 const firstStroke=sketch([[.12,.43],[.36,.62],[.72,.27]]);
 const secondStroke=sketch([[.18,.65],[.44,.24],[.67,.65],[.18,.65]]);
 const type=text=>async page=>{await answer(page).press('End');await page.keyboard.insertText(text);};
 const draw=chain(conversation,tap('Scratch'),firstStroke);
 add('tutor-scratch-drawing',tutor,draw,flags);
 add('tutor-scratch-resized',tutor,chain(draw,async page=>page.getByRole('separator',{name:'Resize scratch pad'}).press('ArrowUp')),flags);
 add('tutor-scratch-actions',tutor,chain(draw,tap('Scratch pad actions')),flags);
 const multiple=chain(conversation,openAnswer,type('First sketch '),tap('Scratch'),firstStroke,tap('Insert drawing'),
  async page=>chips(page).first().waitFor(),type(' then another '),tap('Scratch'),secondStroke,tap('Insert drawing'),
  async page=>chips(page).nth(1).waitFor(),type(' to compare.'));
 add('tutor-multiple-drawings',tutor,multiple,flags);
 const edit=chain(multiple,async page=>chips(page).first().getByRole('button',{name:'Edit drawing',exact:true}).click(),
  async page=>page.getByRole('button',{name:'Update drawing',exact:true}).waitFor());
 add('tutor-drawing-preview',tutor,edit,flags);
 add('tutor-drawing-removed',tutor,chain(multiple,async page=>{
  const id=await chips(page).nth(1).getAttribute('data-image-id');
  await chips(page).nth(1).getByRole('button',{name:'Remove drawing',exact:true}).click();
  await answer(page).locator('[data-image-id="'+id+'"]').waitFor({state:'detached'});
  await chips(page).first().waitFor();
 }),flags);
 add('tutor-symbols-phrases-page-two',tutor,chain(conversation,openSymbols,async page=>page.getByRole('group',{name:'Math categories'}).getByRole('button',{name:'Phrases',exact:true}).click(),tap('Next phrase page')),flags);

 const tutorSettings='/settings?section=tutor';
 const beta=page=>page.getByRole('switch',{name:'Draw single symbols',exact:true});
 add('tutor-beta-settings',tutorSettings,async page=>beta(page).waitFor(),flags);
 const openCatalogue=chain(initialAnswer,tap('Maths symbols'),tap('Browse symbols'),
  async page=>page.getByRole('dialog',{name:'Symbols',exact:true}).waitFor());
 add('tutor-symbol-catalogue',tutor,openCatalogue,flags);
 add('tutor-symbol-search',tutor,chain(openCatalogue,async page=>{
  await page.getByRole('searchbox',{name:'Search symbols',exact:true}).fill('not element of');
  await page.getByRole('button',{name:'Not an element of',exact:true}).waitFor();
 }),flags);
 add('tutor-symbol-search-description',tutor,chain(openCatalogue,async page=>{
  await page.getByRole('searchbox',{name:'Search symbols',exact:true}).fill('upside-down A');
  await page.getByRole('dialog',{name:'Symbols',exact:true}).getByRole('button',{name:'For all',exact:true}).waitFor();
 }),flags);
 const openBetaPad=chain(async page=>{
  const control=beta(page);
  if(await control.getAttribute('aria-checked')!=='true')await control.click();
  await page.evaluate(route=>{location.hash=route;},tutor);
  await page.waitForURL(url=>url.hash==='#'+tutor);
 },initialAnswer,tap('Draw symbol'));
 add('tutor-symbol-recognition-loading',tutorSettings,chain(async page=>{
  // Pause the worker request at the client boundary for this one capture.
  // The app enters its real loading state without a pending network request.
  await page.evaluate(()=>{
   const send=Worker.prototype.postMessage;
   Worker.prototype.postMessage=function(message,...args){
    if(message?.type==='prepare'&&message.assetSetVersion?.startsWith('detypify-'))return;
    return send.call(this,message,...args);
   };
  });
 },openBetaPad,async page=>{
  const pad=page.getByRole('region',{name:'Symbol recognition',exact:true});
  await pad.getByRole('status').filter({hasText:'Preparing recognition'}).waitFor();
  await pad.locator('.tutor-ink-results .tutor-ink-spinner').waitFor();
 }),flags);
 const symbolStrokes=strokes=>async page=>{
  const paper=page.getByRole('img',{name:'Draw one symbol',exact:true});
  await paper.waitFor();
  const box=await paper.boundingBox();
  if(!box)throw new Error('Symbol recognition drawing surface is unavailable');
  const scale=Math.min(box.width/320,box.height/116);
  const left=box.x+(box.width-320*scale)/2;
  const top=box.y+(box.height-116*scale)/2;
  for(const [[x,y],...rest] of strokes){
   await page.mouse.move(left+x*scale,top+y*scale);
   await page.mouse.down();
   for(const [x,y] of rest)await page.mouse.move(left+x*scale,top+y*scale,{steps:6});
   await page.mouse.up();
  }
 };
 const match=chain(openBetaPad,symbolStrokes([[[128,26],[160,91],[192,26]],[[141,52],[179,52]]]),async page=>{
  // For all is a real model result; the geometry policy does not recognize it.
  await page.getByRole('button',{name:'Matches For all',exact:true}).waitFor({timeout:25000});
 });
 add('tutor-symbol-recognition-match',tutorSettings,match,flags);
 add('tutor-symbol-recognition-completion',tutorSettings,chain(openBetaPad,
  symbolStrokes([[[180,20],[114,50],[180,80]]]),async page=>{
   await page.getByRole('button',{name:'Could become Less than or equal to',exact:true}).waitFor();
   await page.getByText('Preparing recognition…',{exact:true}).waitFor({state:'hidden',timeout:25000});
  }),flags);
 add('tutor-symbol-recognition-inserted',tutorSettings,chain(match,tap('Matches For all'),async page=>{
  await answer(page).filter({hasText:/^∀$/}).waitFor();
  await board(page).getByRole('button',{name:'Draw symbol',exact:true}).waitFor();
 }),flags);
}

const emptyRoutes=['today','paths','cards','tasks','calendar-day','calendar-week','calendar-month','calendar-agenda','review-hub','practice','progress','progress-learning','time-log','inbox','inbox-plans','atlas-list','settings'];
for(const name of emptyRoutes){const scene=catalog.find(item=>item.name===name);if(scene)add('empty-'+name,scene.hash,undefined,{demo:'first-use'});}

export const profiles={phone:{width:390,height:844},small:{width:320,height:640},large:{width:390,height:844,text:160},landscape:{width:844,height:390},tablet:{width:834,height:1112},desktop:{width:1440,height:1000}};
