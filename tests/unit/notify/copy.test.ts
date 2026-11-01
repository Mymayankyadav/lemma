import {describe,it,expect} from 'vitest'
import {notificationCopy,type NoticeCopyInput} from '../../../supabase/functions/notify/copy'

describe('NOTIF-3a exact kind copy and safe tone',()=>{
 const cases:Array<[NoticeCopyInput,string,string]>=[
  [{kind:'due',count:1,backlog:1,minutes:1},'1 card due','About 1 min. Start with 5?'],
  [{kind:'due',count:23,backlog:90,minutes:9},'23 cards due',"Today's share is 23 (about 9 min). Start with 5?"],
  [{kind:'due',count:1000,backlog:1200,minutes:300},'999+ cards due',"Today's share is 999+ (about 300 min). Start with 5?"],
  [{kind:'deadline',checkpoints:[{project:'Algebra 1',code:'CP4',title:'Groups',step:2,steps:5}]},
   'CP4 is planned for tomorrow',"Algebra 1 · Groups. You're on step 2 of 5; about 20 min today keeps it on time."],
  [{kind:'deadline',checkpoints:[{project:'Algebra 1',code:'CP4',title:'Groups',step:0}]},
   'CP4 is planned for tomorrow','Algebra 1 · Groups. Starting today keeps it on time.'],
  [{kind:'deadline',checkpoints:[
   {project:'Algebra',code:'CP4',title:'Groups'},{project:'Analysis',code:'CP2',title:'Limits'}]},
   '2 checkpoints planned for tomorrow','Algebra: CP4 Groups · Analysis: CP2 Limits'],
  [{kind:'behind',project:'Algebra',code:'CP4',dueDate:'29 Oct'},
   'Algebra: a smaller step today?',
   'The plan had CP4 by 29 Oct. One step of it (about 15 min) is enough for today, or ask your tutor to re-plan.'],
  [{kind:'resume',project:'Algebra',step:2,steps:5,question:'Is the map well-defined?'},
   'Pick up Algebra','Step 2 of 5 · Is the map well-defined?'],
  [{kind:'resume',project:'Analysis',step:1,steps:3,checkpointTitle:'Compactness'},
   'Pick up Analysis','Step 1 of 3 · Compactness'],
  [{kind:'tutor',sources:['claude'],counts:{cards:1},projects:['Algebra']},
   'Claude left 1 proposal','1 card · Algebra'],
  [{kind:'tutor',sources:['claude','chatgpt'],counts:{cards:5,planChanges:1,cardEdits:2},projects:['Algebra 1'],notesAnswered:2},
   'Your tutor left 8 proposals','5 cards · 1 plan change · 2 card edits · Algebra 1 · answers 2 of your card notes'],
  [{kind:'tutor',sessionNo:'S3',summary:'A proof was saved.'},
   'Session S3 saved','A proof was saved.'],
  [{kind:'digest',period:'weekly',daysStudied:3,cardsReviewed:30,checkpoints:2,next:{code:'CP4',title:'Groups',date:'3 Nov'}},
   'Your week in Lemma','3 days studied · 30 cards · 2 checkpoints demonstrated. Next: CP4 Groups (3 Nov).'],
  [{kind:'digest',period:'weekly',daysStudied:0,cardsReviewed:0,checkpoints:0},
   'Your week in Lemma','0 days studied.'],
  [{kind:'digest',period:'daily',clauses:['23 cards (9 min)','CP4 planned for tomorrow','Pick up Algebra at step 2','Ignored fourth clause']},
   'Today in Lemma','23 cards (9 min) · CP4 planned for tomorrow · Pick up Algebra at step 2'],
  [{kind:'plan',project:'Algebra',planEnd:'8 Nov',targetDate:'5 Nov'},
   'Algebra now ends after your target','The plan ends 8 Nov; the target is 5 Nov. Ask your tutor to tighten it, or move the target.'],
  [{kind:'rhythm',count:1,minutes:1,code:'CP2',project:'Analysis'},
   'A short session?','1 card (about 1 min), or one step of CP2 in Analysis.'],
 ]
 it.each(cases)('renders %j exactly', (input,title,body)=>{
  const result=notificationCopy(input)
  expect(result.title).toBe(title)
  expect(result.body).toBe(body)
  expect(result.tag).toBe(input.kind==='confirm'?'tutor':input.kind)
 })
 it('never exposes raw TeX, forbidden language or oversized system text',()=>{
  const input:NoticeCopyInput={kind:'deadline',checkpoints:[{
   project:'Real Analysis',code:'CP4',title:'Why is $\\mathbb R$ not compact?',step:1,steps:2
  }]}
  const rendered=notificationCopy(input)
  expect(rendered.body).toContain('ℝ')
  const all=[...cases.map(([input])=>notificationCopy(input)),rendered]
  const forbidden=/\b(?:missed|failed|overdue|streak|only|still|again|hurry)\b|don't break|!|[\u{1F300}-\u{1FAFF}]/iu
  for(const item of all){
   expect(item.title.length).toBeLessThanOrEqual(48)
   expect(item.body.length).toBeLessThanOrEqual(140)
   expect(item.title+' '+item.body).not.toMatch(forbidden)
   expect(item.title+' '+item.body).not.toMatch(/[\\$]/)
  }
 })
 it('removes prohibited tone even from owner-created project names',()=>{
  const copy=notificationCopy({kind:'behind',project:'Failed streak again!',code:'CP1',dueDate:'1 Nov'})
  expect(copy.title+' '+copy.body).not.toMatch(/failed|streak|again|!/i)
  expect(copy.title).toContain('unfinished rhythm next.')
 })
 it('limits a saved session summary to its first 120 characters before OS text conversion',()=>{
  const summary='A'.repeat(120)+'NEVER-INCLUDE-THIS-TAIL'
  const rendered=notificationCopy({kind:'tutor',sessionNo:'S5',summary})
  expect(rendered.title).toBe('Session S5 saved')
  expect(rendered.body).toBe('A'.repeat(120))
  expect(rendered.body).not.toContain('NEVER-INCLUDE')
 })
 it('strips Unicode flag, family, keycap and pictographic emoji while retaining mathematical text',()=>{
  const examples=['Algebra 🇮🇳','Algebra 👨‍👩‍👧‍👦','Algebra 1️⃣','Algebra 🧮','Algebra 👍🏽']
  for(const project of examples){
   const rendered=notificationCopy({kind:'behind',project,code:'CP1',dueDate:'2 Nov'})
   const combined=rendered.title+' '+rendered.body
   expect(combined).not.toMatch(/[\p{Regional_Indicator}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\u20E3\uFE0F]/u)
   expect(combined).toContain('Algebra')
  }
  expect(notificationCopy({kind:'behind',project:'Algebra 🇮🇳',code:'CP1',dueDate:'2 Nov'}).title).toBe('Algebra: a smaller step today?')
  const math=notificationCopy({kind:'behind',project:'ℝ → ℂ',code:'CP1',dueDate:'2 Nov'})
  expect(math.title).toContain('ℝ → ℂ')
 })
 it('keeps different project slugs separate even when display titles coincide',()=>{
  const checkpoints=[
   {project:'Algebra',slug:'algebra-one',code:'CP1',title:'Groups'},
   {project:'Algebra',slug:'algebra-two',code:'CP2',title:'Rings'},
   {project:'Analysis',slug:'analysis',code:'CP3',title:'Limits'},
  ];
  const copy=notificationCopy({kind:'deadline',checkpoints});
  expect(copy.title).toBe('3 checkpoints planned for tomorrow');
  expect(copy.body).toContain('Algebra: CP1 Groups');
  expect(copy.body).toContain('Algebra: CP2 Rings');
  expect(copy.body).toContain('Analysis: CP3 Limits');
  expect(copy.body.length).toBeLessThanOrEqual(140);
 });
 it('groups tomorrow reminders by project rather than consuming slots per checkpoint',()=>{
  const checkpoints=[
   {project:'Algebra',code:'CP1',title:'Groups'},
   {project:'Algebra',code:'CP2',title:'Rings'},
   {project:'Algebra',code:'CP3',title:'Fields'},
   {project:'Analysis',code:'CP4',title:'Limits'},
  ]
  const copy=notificationCopy({kind:'deadline',checkpoints})
  expect(copy.title).toBe('4 checkpoints planned for tomorrow')
  expect(copy.body).toContain('Algebra: CP1 Groups')
  expect(copy.body).toContain('Analysis: CP4 Limits')
  expect(copy.body).toContain('+2 checkpoints')
  expect(copy.body).not.toContain('Algebra: CP2')
  expect(copy.body.length).toBeLessThanOrEqual(140)
  const long=checkpoints.map((cp,i)=>i===0?{...cp,title:'A very long checkpoint title about compactness and convergence '.repeat(5)}:cp)
  expect(notificationCopy({kind:'deadline',checkpoints:long}).body).toContain('+2 checkpoints')
 })
 it('reserves space for three distinct projects and counts omitted projects',()=>{
  const checkpoints=['Algebra','Analysis','Topology','Geometry'].map((project,i)=>({
   project,code:'CP'+(i+1),title:'A long checkpoint title about compactness and continuous functions'.repeat(2)
  }))
  const copy=notificationCopy({kind:'deadline',checkpoints})
  for(const project of ['Algebra','Analysis','Topology'])expect(copy.body).toContain(project+':')
  expect(copy.body).toContain('+1 more')
  expect(copy.body).not.toContain('Geometry:')
  expect(copy.body.length).toBeLessThanOrEqual(140)
 })
 it('requires a checkpoint to construct a tomorrow reminder',()=>{
  expect(()=>notificationCopy({kind:'deadline',checkpoints:[]})).toThrow('Deadline requires a checkpoint')
 })
 it('truncates long user-provided project and checkpoint titles at word boundaries',()=>{
  const copy=notificationCopy({kind:'behind',project:'Foundations of the extremely long mathematical universe',code:'CP12',dueDate:'29 Oct'})
  expect(copy.title.endsWith('…')).toBe(true)
  expect(copy.title.length).toBeLessThanOrEqual(48)
 })
})
