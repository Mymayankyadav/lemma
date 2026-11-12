import {describe,expect,it} from 'vitest';
import type {CardRow,DeckNode,ProjectSummary,SessionEvent} from '../../../src/data/types';
import {countByFilter,dueBySlug,groupBySubject,matchesSearch,nowLine,orderPaths,ownPaths,scheduleTone} from '../../../src/features/projects/v7/pathsModel';
import {cardFilters,cardMeta,dueWords,isDueToday,sortCards} from '../../../src/features/cards/v7/cardsModel';
import {insertAt,macroKeys} from '../../../src/features/cards/v7/editorModel';
import {eventEyebrow,groupEvidence,outcomeBadge} from '../../../src/features/project/v7/Evidence';
import {recallSeries} from '../../../src/features/card/v7/recallModel';
import {v7ScreenFor} from '../../../src/app/v7Kit';

const subject=(id:string,name:string)=>({id,name,glyph:'∫'}) as unknown as ProjectSummary['subject'];
const path=(over:Partial<ProjectSummary>):ProjectSummary=>({id:over.slug??'x',slug:'x',title:'X',subject:subject('s1','Analysis'),status:'active',done:0,total:4,current:null,
 lastActivityAt:null,cardsCount:0,sessionsCount:0,sourcesCount:0,...over});

describe('v7 Paths hub (PLAN §6.8)',()=>{
 const rows=[
  path({slug:'a',title:'Real Analysis',lastActivityAt:'2026-11-08T10:00:00Z',current:{code:'CP4',title:'Compactness',step:3,stepsTotal:4}}),
  path({slug:'b',title:'Measure',lastActivityAt:'2026-11-09T10:00:00Z',sourceTitles:['Rudin']}),
  path({slug:'c',title:'Topology',pinned:true,subject:subject('s2','Topology'),lastActivityAt:'2026-10-01T10:00:00Z'}),
  path({slug:'d',title:'Old',status:'archived'}),path({slug:'e',title:'Inbox',system:true}),
 ];
 it('hides the system path and counts each status',()=>{
  const own=ownPaths(rows);
  expect(own.map(row=>row.slug)).not.toContain('e');
  expect(countByFilter(own)).toEqual({active:3,paused:0,done:0,archived:1});
 });
 it('orders pinned first, then most recently studied',()=>{
  expect(orderPaths(ownPaths(rows).filter(row=>row.status!=='archived')).map(row=>row.slug)).toEqual(['c','b','a']);
 });
 it('searches titles, subjects, the current checkpoint and sources, ignoring accents and case',()=>{
  expect(matchesSearch(rows[0],'compact')).toBe(true);
  expect(matchesSearch(rows[1],'rudin')).toBe(true);
  expect(matchesSearch(rows[2],'TOPOLOGY')).toBe(true);
  expect(matchesSearch(path({title:'Théorie'}),'theorie')).toBe(true);
  expect(matchesSearch(rows[0],'algebra')).toBe(false);
 });
 it('shows a subject heading only for two or more paths',()=>{
  const groups=groupBySubject(orderPaths(ownPaths(rows).filter(row=>row.status!=='archived')));
  expect(groups.map(group=>[group.subject,group.heading])).toEqual([['Topology',false],['Analysis',true]]);
 });
 it('says where the path stands and colours the schedule chip',()=>{
  expect(nowLine(rows[0])).toBe('Now: Compactness · step 3 of 4');
  expect(nowLine(path({total:0}))).toBe('Waiting for a plan from your tutor');
  expect(scheduleTone('4 days behind')).toEqual({text:'4 days behind',tone:'warning'});
  expect(scheduleTone('On track')?.tone).toBe('success');
  expect(scheduleTone(null)).toBeNull();
 });
 it('adds project and checkpoint decks into one due count per path',()=>{
  const decks=[{key:'project:a',label:'A',glyph:'∫',level:0,due:3,children:[{key:'cp:a:CP1',label:'',glyph:'∫',level:1,due:5,children:[]}]}] as unknown as DeckNode[];
  expect(dueBySlug(decks).get('a')).toBe(5);
 });
});

describe('v7 Cards (PLAN §6.11)',()=>{
 const now=new Date('2026-11-09T08:13:00Z'),zone='Asia/Kolkata';
 const card=(over:Partial<CardRow>):CardRow=>({noteNo:1,front:'f',type:'basic',kind:'other',projectSlug:'a',glyph:'∫',checkpointCode:'CP4',due:null,status:'active',openComments:0,...over});
 it('maps the filters to the search API; Due is a time test, Paused the note status',()=>{
  expect(cardFilters({query:' x ',slug:'a',checkpoint:'',state:'new',comments:true})).toEqual({query:'x',projectSlug:'a',checkpointCode:undefined,state:0,noteStatus:undefined,hasOpenComments:true});
  expect(cardFilters({query:'',slug:'',checkpoint:'',state:'paused',comments:false}).noteStatus).toBe('suspended');
  expect(cardFilters({query:'',slug:'',checkpoint:'',state:'due',comments:false}).state).toBeUndefined();
 });
 it('decides "due today" in the owner zone',()=>{
  expect(isDueToday(card({due:'2026-11-09T18:00:00Z'}),now,zone)).toBe(true); // 23:30 IST the same day
  expect(isDueToday(card({due:'2026-11-09T19:00:00Z'}),now,zone)).toBe(false); // 00:30 IST the next day
  expect(isDueToday(card({due:null}),now,zone)).toBe(false);
 });
 it('writes the meta line with words, not abbreviations',()=>{
  expect(cardMeta(card({noteNo:49,due:'2026-11-16T06:00:00Z',openComments:2}),now,zone,'Real Analysis')).toBe('Real Analysis · due in 7 days · 2 comments');
  // R1 · F49: no internal codes in the meta line.
  expect(cardMeta(card({noteNo:49,due:'2026-11-16T06:00:00Z',openComments:0}),now,zone)).not.toMatch(/N49|CP4/);
  expect(dueWords(card({status:'suspended'}),now,zone)).toBe('paused');
  expect(dueWords(card({due:'2026-11-10T06:00:00Z'}),now,zone)).toBe('due tomorrow');
 });
 it('sorts due first with new and paused cards after, or newest first',()=>{
  const rows=[card({noteNo:1,status:'suspended',due:'2026-11-01T00:00:00Z'}),card({noteNo:2}),card({noteNo:3,due:'2026-11-12T00:00:00Z'}),card({noteNo:4,due:'2026-11-08T00:00:00Z'})];
  expect(sortCards(rows,'due').map(row=>row.noteNo)).toEqual([4,3,2,1]);
  expect(sortCards(rows,'newest').map(row=>row.noteNo)).toEqual([4,3,2,1].sort((a,b)=>b-a));
 });
 it('offers the owner macros first and puts the caret inside the braces',()=>{
  expect(macroKeys('\\R: \\mathbb{R}\n\\norm: \\lVert #1 \\rVert\n\\R: again').map(key=>key.label)).toEqual(['\\R','\\norm']);
  expect(insertAt('ab',1,1,'\\frac{}{}')).toEqual({value:'a\\frac{}{}b',caret:7});
  expect(insertAt('',0,0,'$$')).toEqual({value:'$$',caret:1});
 });
});

describe('v7 evidence and recall',()=>{
 const event=(id:number,kind:SessionEvent['kind'],at:string,extra:Partial<SessionEvent>={}):SessionEvent=>({id,kind,body:'b',outcome:null,hintLevel:null,checkpointCode:'CP4',createdAt:at,...extra});
 it('names each entry by kind, with the hint level',()=>{
  expect(eventEyebrow(event(1,'hint','2026-11-08T10:00:00Z',{hintLevel:2}))).toBe('Hint 2');
  expect(eventEyebrow(event(1,'pretest','2026-11-08T10:00:00Z'))).toBe('Pretest');
  expect(outcomeBadge('demonstrated')).toEqual({tone:'success',text:'Demonstrated'});
  expect(outcomeBadge(null)).toBeNull();
 });
 it('groups evidence under the session it happened in, newest first',()=>{
  const sessions=[{number:6,startedAt:'2026-11-05T10:00:00Z',lastActivityAt:'2026-11-05T11:00:00Z'},{number:7,startedAt:'2026-11-08T09:48:00Z',lastActivityAt:'2026-11-08T10:30:00Z'}];
  const groups=groupEvidence([event(1,'attempt','2026-11-05T10:10:00Z'),event(2,'hint','2026-11-08T10:00:00Z'),event(3,'evidence','2026-11-08T10:20:00Z')],sessions,'Asia/Kolkata');
  expect(groups.map(group=>[group.label,group.events.map(item=>item.id)])).toEqual([['Session 7 · Sun 8 Nov',[3,2]],['Session 6 · Thu 5 Nov',[1]]]);
 });
 it('replays reviews: recall is 100% after each review and lower just before the next',()=>{
  const settings={learnSteps:'1m 10m',relearnSteps:'10m',fsrsWeights:null,desiredRetention:.9,maxIntervalDays:36500,fuzz:false,loadBalance:false,rolloverHour:4,timeZone:'Asia/Kolkata'} as never;
  const series=recallSeries([{reviewedAt:'2026-10-01T10:00:00Z',rating:3},{reviewedAt:'2026-10-10T10:00:00Z',rating:3},{reviewedAt:'2026-11-01T10:00:00Z',rating:1}],settings,Date.parse('2026-11-09T10:00:00Z'))!;
  expect(series.dots.map(dot=>dot.rating)).toEqual([3,3,1]);
  expect(series.dots[0].recall).toBe(1);
  expect(series.dots[1].recall).toBeLessThan(1);
  expect(series.dots[1].recall).toBeGreaterThan(0);
  expect(series.line.every(point=>point.recall>=0&&point.recall<=1)).toBe(true);
  expect(series.line.at(-1)!.at).toBe(Date.parse('2026-11-09T10:00:00Z'));
  expect(series.dots[0].intervalDays).toBeGreaterThan(0);
 });
 it('routes the learning screens to v7',()=>{
  expect(v7ScreenFor('/projects')).toBe('paths');
  expect(v7ScreenFor('/projects/new')).toBe('paths');
  expect(v7ScreenFor('/s/real-analysis/7')).toBe('session');
  expect(v7ScreenFor('/cards')).toBe('cards');
  expect(v7ScreenFor('/cards/12')).toBe('card');
 });
});
