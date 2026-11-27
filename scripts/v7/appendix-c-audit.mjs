import {expect} from '@playwright/test';
import {DATE, openScene} from '../../tests/e2e/v7-scenes.ts';
import {contrastAt} from '../../tests/e2e/helpers/contrast.ts';
import {enableSurfaceBeta} from '../../tests/e2e/helpers/surface-preview.ts';

const helperOnly = [
  ['features/calendar/deadlines/DueDayItems.tsx', '/calendar'],
  ['features/calendar/deadlines/OverdueBanner.tsx', '/calendar'],
  ['features/calendar/views/WeekView.tsx', '/calendar?view=week'],
  ['features/cards/Editor.tsx', '/cards'],
  ['features/focus/PresetPicker.tsx', '/'],
  ['features/home/V6TodayPlan.tsx', '/'],
  ['features/plan-proposal/v6/PlanProposalV6.tsx', '/proposals?tab=plan'],
  ['features/practice/Page.tsx', '/practice'],
  ['features/proposals/v6/Evidence.tsx', '/proposals'],
  ['features/proposals/v6/Selection.tsx', '/proposals'],
  ['features/settings/v6/DeleteAccount.tsx', '/settings?section=data'],
  ['features/settings/v6/Export.tsx', '/settings?section=data'],
  ['features/settings/v6/Planning.tsx', '/settings?section=planning'],
  ['features/time-log/Page.tsx', '/log'],
];

const text = (name, locator) => ({name, locator});
const edge = (name, locator) => ({name, locator, boundary:'border'});
const fill = (name, locator) => ({name, locator, boundary:'fill'});
const button = (root, name) => root.getByRole('button', {name, exact:true});
const field = (root, name, role='textbox') => root.getByRole(role, {name, exact:true});
const dialog = (page, name) => page.getByRole('dialog', {name, exact:true});

async function openAtlasIdea(page) {
  await button(page,'Search concepts').click();
  await field(page,'Find a concept','searchbox').fill('compact');
  await page.getByRole('list',{name:'Matching concepts'}).getByRole('button',{name:/^Compactness\s+Analysis$/}).click();
}

const catalog = [
  {name:'pad', hash:'/pad?path=real-analysis&checkpoint=CP4', checks:[
    {module:'features/pad/OfflinePadPage.tsx + LocalPad*.tsx + local-pad.css',
      pairs:page=>[edge('Pad notes',field(page,'Pad notes')),text('Pad eyebrow',page.locator('.local-pad-eyebrow'))]},
  ]},
  {name:'route-error', hash:'/insights',
    setup:page=>page.route(/\/assets\/ProgressV7-[^/]+\.js(?:\?.*)?$/,route=>route.abort()),
    checks:[{module:'app/RouteError.tsx',pairs:page=>[
      text('Route error heading',page.locator('.lemma-route-error h1')),
      fill('Retry',button(page,'Retry')),
    ]}]},
  {name:'atlas-command',hash:'/atlas',prepare:async page=>{
    await openAtlasIdea(page);
    await button(page,'Edit concept').click();
  },checks:[{module:'features/atlas/v6/AtlasCommands.tsx',pairs:page=>[
    edge('Idea name',field(dialog(page,'Edit idea'),'Atlas idea name')),
  ]}]},
  {name:'atlas-pin',hash:'/atlas',prepare:async page=>{
    await openAtlasIdea(page);
    await page.getByRole('button',{name:/^(Pin on map|Edit map pin)$/}).click();
  },checks:[{module:'features/atlas/v6/ConceptPin.tsx',pairs:page=>[
    edge('X coordinate',field(dialog(page,'Map pin: Compactness'),'Map X coordinate','spinbutton')),
  ]}]},
  {name:'atlas-impact',hash:'/atlas',prepare:async page=>{
    await openAtlasIdea(page);
    await button(page,'Preview edits').click();
  },checks:[{module:'features/atlas/v6/ImpactPreview.tsx',pairs:page=>[
    text('Target concept',dialog(page,'Preview changes to Compactness').getByRole('button',{name:/Target concept/})),
  ]}]},
  {name:'calendar-block',hash:'/calendar?view=day&date='+DATE+'&new=block',checks:[
    {module:'features/calendar/block-sheet/BlockSheetActions.tsx',
      pairs:page=>[text('Editor heading',page.getByRole('dialog').getByRole('heading',{level:2}).first())]},
    {module:'features/calendar/block-sheet/BlockSheet.tsx',historicalHelper:true,
      pairs:page=>[edge('Calendar block title',field(page,'Calendar block title'))]},
  ]},
  {name:'calendar-overlap',hash:'/calendar?view=agenda&date='+DATE,
    setup:page=>page.addInitScript(date=>{
      const block = {kind:'busy',status:'planned',timeZone:'Asia/Kolkata',version:1,
        subjectId:null,projectId:null,checkpointId:null,activityId:null,goalId:null};
      sessionStorage.setItem('lemma.v6.demo.study.v1',JSON.stringify({schema:1,entries:[],blocks:[
        {...block,id:'audit-overlap-1',title:'First commitment',startsAt:date+'T15:00:00+05:30',endsAt:date+'T16:00:00+05:30'},
        {...block,id:'audit-overlap-2',title:'Second commitment',startsAt:date+'T15:30:00+05:30',endsAt:date+'T16:30:00+05:30'},
      ]}));
    },DATE),
    prepare:async page=>expect(page.getByRole('button',{name:/Keep both for/})).toBeEnabled(),
    checks:[{module:'features/calendar/overlaps/OverlapMarkers.tsx',pairs:page=>[
      text('Conflict description',page.locator('[data-overlap] > p').first()),
      edge('Keep both',page.getByRole('button',{name:/Keep both for/})),
    ]}]},
  {name:'planner',hash:'/calendar?view=day&date='+DATE+'&plan=1',checks:[
    {module:'features/planner/Sheet.tsx',pairs:page=>[
      text('Planner title',dialog(page,'Plan study tasks').getByRole('heading',{name:'Plan study tasks'})),
      text('Change time',button(dialog(page,'Plan study tasks'),'Change time').first()),
    ]},
  ]},
  {name:'project-switcher',hash:'/p/real-analysis',prepare:async page=>{
    await button(page,'More path actions').click();
    await page.getByRole('menuitem',{name:'Switch path',exact:true}).click();
  },checks:[{module:'features/project/ProjectSwitcher.tsx',pairs:page=>[
    edge('Find a path',field(dialog(page,'Switch path'),'Find a path','searchbox')),
  ]}]},
  {name:'source-reader',hash:'/p/real-analysis?tab=sources',
    prepare:page=>page.getByRole('region',{name:'Sources',exact:true}).locator('li button').first().click(),
    checks:[{module:'features/project/SourceTranscriptionView.tsx',pairs:page=>[
      text('Reader toggle',page.locator('[data-source-transcription]').getByRole('button',{name:/^(View pages|Hide transcription)$/})),
    ]}]},
  {name:'source-manager',hash:'/p/real-analysis?tab=sources',prepare:page=>button(page,'Manage sources').click(),
    checks:[{module:'features/project/SourcesPanel.tsx',pairs:page=>[
      text('Add sources',dialog(page,'Manage sources').getByRole('button',{name:/^Add sources/})),
    ]}]},
  {name:'settings-study',hash:'/settings?section=study&advanced=1',checks:[
    {module:'features/settings/v6/Activities.tsx',pairs:page=>[
      edge('Activity name',field(page.getByRole('region',{name:'Activities',exact:true}),'Activity name')),
    ]},
    {module:'features/settings/v6/Focus.tsx',pairs:page=>[
      edge('Focus minutes',field(page.getByRole('region',{name:'Focus preferences',exact:true}),'Focus minutes','spinbutton')),
    ]},
  ]},
  {name:'settings-tutor',hash:'/settings?section=tutor',checks:[
    {module:'features/settings/ConnectorAddress.tsx',pairs:page=>[
      text('Masked connector address',page.locator('[data-connector-address] > span').last()),
    ]},
    {module:'features/settings/v6/StudyDefaults.tsx',prepare:page=>button(page,'Tutor rules').click(),pairs:page=>[
      edge('Tutor rules text',field(dialog(page,'Tutor rules'),'Tutor rules text')),
      edge('Cancel',button(dialog(page,'Tutor rules'),'Cancel')),
    ]},
  ]},
  {name:'math-text',hash:'/cards/4',demo:'stress',checks:[
    {module:'ui/MathText.tsx',pairs:page=>[
      text('Typeset formula',page.locator('.v7-card-face-front .lemma-math .katex-html .base').first()),
    ]},
  ]},
  {name:'toast',hash:'/settings?section=planning',prepare:async page=>{
    await page.getByRole('button',{name:/^Week starts on/}).click();
    const picker=dialog(page,'Week starts on');
    const current=await picker.getByRole('radio',{checked:true}).innerText();
    await picker.getByRole('radio',{name:current==='Friday'?'Tuesday':'Friday',exact:true}).click();
  },checks:[{module:'ui/Toast.tsx',pairs:page=>[
    text('Notification text',page.locator('.v7-app-toast-text').last()),
    text('Undo',page.locator('.v7-app-toast').getByRole('button',{name:'Undo',exact:true})),
  ]}]},
];

const profiles = [
  ['day','day','dark'],
  ['night','night','light'],
  ['auto-light','auto','light'],
  ['auto-dark','auto','dark'],
  ['high-day','day','light',true],
  ['high-night','night','dark',true],
];

async function measurePair({name, locator, boundary}) {
  await expect(locator).toBeVisible();
  const paint = await contrastAt(locator);
  const boundaryRatio = boundary==='border'?paint.edge:boundary==='fill'?paint.fill:undefined;
  const borderWidth = boundary==='border'?paint.border:undefined;
  return {
    name, textRatio:paint.text, boundaryRatio, borderWidth,
    passes:paint.text>=4.5 && (boundaryRatio===undefined || boundaryRatio>=3)
      && (borderWidth===undefined || borderWidth>0),
  };
}

export async function auditAppendixC(browser,address,selection) {
  const requestedScenes=selection.filter(argument=>!argument.startsWith('--profile='));
  const requestedProfiles=selection.filter(argument=>argument.startsWith('--profile=')).map(argument=>argument.slice(10));
  const runs=[];
  const inventory=[
    ...catalog.flatMap(scene=>scene.checks.map(check=>({
      module:'src/'+check.module, route:scene.hash, scene:scene.name,
      appendixClassification:check.historicalHelper?'helper-only':'rendered',
      currentClassification:'rendered',
    }))),
    ...helperOnly.map(([module,route])=>({
      module:'src/'+module,route,appendixClassification:'helper-only',currentClassification:'helper-only',
    })),
  ];
  if(inventory.length!==32 || new Set(inventory.map(row=>row.module)).size!==32
    || inventory.filter(row=>row.appendixClassification==='rendered').length!==17) {
    throw Error('Appendix C inventory must contain its 32 unique rows and 17 historically rendered modules');
  }
  for (const scene of requestedScenes) if (!catalog.some(item=>item.name===scene)) throw Error('Unknown Appendix C scene: '+scene);
  for (const profile of requestedProfiles) if (!profiles.some(item=>item[0]===profile)) throw Error('Unknown Appendix C profile: '+profile);
  for (const [profile,mode,scheme,high=false] of profiles.filter(([name])=>!requestedProfiles.length||requestedProfiles.includes(name))) {
    for (const scene of catalog.filter(({name})=>!requestedScenes.length||requestedScenes.includes(name))) {
      const page=await browser.newPage({baseURL:address,viewport:{width:390,height:844},locale:'en-IN',timezoneId:'Asia/Kolkata'});
      page.setDefaultTimeout(4500);
      page.setDefaultNavigationTimeout(12000);
      const run={profile,scene:scene.name,route:scene.hash,modules:[]};
      runs.push(run);
      try {
        await enableSurfaceBeta(page);
        await page.addInitScript(({mode,high})=>{
          localStorage.setItem('lemma.ui',JSON.stringify({mode}));
          if(high)document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.contrast='high';});
        },{mode,high});
        await scene.setup?.(page);
        await openScene(page,scene,scheme,{width:390,height:844});
        const resolved=mode==='night'||(mode==='auto'&&scheme==='dark')?'graph-night':'graph';
        await expect(page.locator('html')).toHaveAttribute('data-appearance-mode',mode);
        await expect(page.locator('html')).toHaveAttribute('data-theme',resolved);
        if(high)await expect(page.locator('html')).toHaveAttribute('data-contrast','high');
        for (const check of scene.checks) {
          const result={module:'src/'+check.module,pairs:[]};
          run.modules.push(result);
          try {
            await check.prepare?.(page);
            for (const pair of check.pairs(page)) result.pairs.push(await measurePair(pair));
          } catch (error) {
            result.error=String(error);
          }
        }
      } catch (error) {
        run.error=String(error);
      } finally {
        await page.close();
      }
    }
  }
  return {inventory,runs};
}
