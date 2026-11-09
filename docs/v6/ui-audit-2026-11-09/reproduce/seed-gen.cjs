// Builds realistic sessionStorage snapshots for the v6 demo stores (schema 1),
// anchored on "now" in Asia/Kolkata. Output: seed.json {key: jsonString}.
const fs=require('fs');
let s=20261109;const rnd=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648};
const pick=a=>a[Math.floor(rnd()*a.length)];
const IST=330; // minutes
// civil IST date+time -> ISO instant
const at=(dateStr,h,m=0)=>{const [Y,M,D]=dateStr.split('-').map(Number);return new Date(Date.UTC(Y,M-1,D,h,m)-IST*60000).toISOString()};
const addDays=(dateStr,n)=>{const [Y,M,D]=dateStr.split('-').map(Number);const d=new Date(Date.UTC(Y,M-1,D+n));return d.toISOString().slice(0,10)};
const TODAY='2026-11-09';
let n=0;const uid=p=>`${p}-${(++n).toString(36)}-${Math.floor(rnd()*1e8).toString(36)}`;
const links={
 a:{subjectId:'subject-analysis',projectId:'project-analysis'},
 l:{subjectId:'subject-linear',projectId:'project-linear'},
 t:{subjectId:'subject-topology',projectId:'project-topology'},
};
const intents={
 a:['Prove Heine–Borel from scratch','Rudin 2.14–2.19 exercises','Uniform continuity on compact sets','Rewrite the sequential compactness proof','ε–δ drills: limits of functions','Read Rudin ch. 4, continuity'],
 l:['Diagonalize 3×3 examples','Problem set 6: eigenvectors','Spectral theorem, real symmetric case','Jordan chains by hand','Axler ch. 5 reading'],
 t:['Munkres §26: compact spaces','Quotient-map criterion proof','Hausdorff separation exercises','Open covers and subcovers','Product topology examples'],
};
const reflections=['Got stuck on choosing δ; the trick is to use compactness first.','Clean proof this time. Wrote it out without notes.','Lost 15 min to phone. Need to park thoughts faster.','Understood why the cover must be open.','Too tired, mostly re-reading.',null,null,null];
// ---- study entries over last 30 days
const entries=[];
for(let d=-29;d<=0;d++){
 const day=addDays(TODAY,d);
 const count=d===0?1:(rnd()<0.28?0:1+Math.floor(rnd()*3));
 const slots=[[6,30],[9,0],[14,0],[16,30],[20,0],[22,0]];
 const used=new Set();
 for(let i=0;i<count;i++){
  let slot;do{slot=pick(slots)}while(used.has(slot[0]));used.add(slot[0]);
  if(d===0)slot=[7,10];
  const k=pick(['a','a','l','t']);const dur=20+Math.floor(rnd()*9)*10;
  const start=at(day,slot[0],slot[1]);
  const intervals=[];
  if(dur>=60&&rnd()<0.6){
   const f1=Math.round(dur*0.55);intervals.push({id:uid('iv'),kind:'focus',start,end:new Date(Date.parse(start)+f1*60000).toISOString()});
   const b=new Date(Date.parse(start)+(f1+10)*60000).toISOString();
   intervals.push({id:uid('iv'),kind:'break',start:intervals[0].end,end:b});
   intervals.push({id:uid('iv'),kind:'focus',start:b,end:new Date(Date.parse(b)+(dur-f1)*60000).toISOString()});
  }else intervals.push({id:uid('iv'),kind:'focus',start,end:new Date(Date.parse(start)+dur*60000).toISOString()});
  const end=intervals[intervals.length-1].end;
  const manual=rnd()<0.1;
  entries.push({...links[k],checkpointId:null,sessionId:null,id:uid('entry'),intent:pick(intents[k]),
   source:manual?'manual':'timer',status:'saved',reflection:pick(reflections),rating:rnd()<0.55?1+Math.floor(rnd()*5):null,
   version:1,createdAt:start,updatedAt:end,savedAt:end,...(manual?{approximate:true}:{}),intervals});
 }
}
// ---- calendar blocks
const blocks=[];const zone='Asia/Kolkata';
const blk=(day,h,m,h2,m2,kind,title,k,status='planned')=>blocks.push({...(k?links[k]:{subjectId:null,projectId:null}),checkpointId:null,sessionId:null,
 id:uid('block'),kind,title,startsAt:at(day,h,m),endsAt:at(day,h2,m2),timeZone:zone,status,version:1});
const W=(i)=>addDays(TODAY,i);
// last week (done/cancelled)
blk(W(-7),7,0,8,30,'study','Rudin ch. 3 exercises','a','done');
blk(W(-6),18,0,19,0,'busy','Gym',null,'done');
blk(W(-5),9,0,11,0,'study','Linear maps review','l','done');
blk(W(-4),15,0,16,0,'study','Topology reading','t','cancelled');
blk(W(-2),10,0,12,0,'study','Weekend proof session','a','done');
// today
blk(W(0),15,0,16,30,'study','Heine–Borel proof attempt','a');
blk(W(0),17,0,18,0,'busy','Lab meeting',null);
blk(W(0),19,30,21,0,'study','Problem set 6 — linear algebra','l');
blk(W(0),20,0,20,45,'busy','Dinner with family',null);
blk(W(0),22,0,22,30,'study','Card review','a');
// tomorrow
blk(W(1),7,0,8,30,'study','Topology: open covers','t');
blk(W(1),10,0,13,0,'busy','Lectures',null);
blk(W(1),16,0,17,30,'study','Rudin ch. 4 exercises','a');
// wed: dense
blk(W(2),6,30,7,30,'study','Morning card review','a');
blk(W(2),9,0,10,0,'busy','Seminar: representation theory',null);
blk(W(2),9,30,11,0,'study','Spectral theorem notes','l');
blk(W(2),14,0,15,0,'study','Quotient topology','t');
blk(W(2),15,0,16,0,'study','Uniform continuity problems','a');
blk(W(2),21,0,23,0,'study','Exam prep: write proofs from memory','a');
// thu/fri/sat
blk(W(3),13,0,16,0,'study','Exam prep: compactness & continuity','a');
blk(W(4),9,0,18,0,'busy','Conference (all day)',null);
blk(W(5),10,0,12,0,'study','Jordan form chains','l');
blk(W(5),23,0,23,59,'study','Late reading: Munkres §27','t');
// next week
blk(W(7),8,0,9,30,'study','Mock exam (timed)','a');
blk(W(8),16,0,17,0,'study','Product topology','t');
blk(W(10),14,0,15,30,'study','Spectral theorem proof','l');
blk(W(12),11,0,12,0,'busy','Office hours',null);
// ---- tasks
const t0='2026-11-01T04:00:00.000Z';
const tasks=[];const task=(title,status,position,k,due,priority='normal',est=45,body='')=>tasks.push({id:uid('task'),title,status,position,
 ...(k?links[k]:{subjectId:null,projectId:null}),checkpointId:null,due,priority,estimateMinutes:est,body,
 completedAt:status==='completed'?at(addDays(TODAY,-1-position),18,0):null,version:1,createdAt:t0,updatedAt:t0});
task('Write up: compact subsets of Hausdorff spaces are closed','backlog',0,'t',{kind:'date',date:TODAY},'high',45);
task('Rudin exercises 4.1–4.8','backlog',1,'a',{kind:'date',date:W(1)},'normal',90);
task('Email Prof. Rao about the seminar slot','backlog',2,null,{kind:'instant',at:at(W(3),10,0)},'low',10);
task('Make cards for uniform continuity','backlog',3,'a',{kind:'date',date:W(-2)},'normal',30);
task('Re-derive the spectral theorem for real symmetric matrices without the fundamental theorem of algebra, then compare with Axler’s approach','backlog',4,'l',{kind:'none'},'normal',120,'Use the variational characterisation: maximise ⟨Ax,x⟩ on the unit sphere.');
task('Summarise the Jordan chain argument','backlog',5,'l',{kind:'none'},'low',null);
task('Problem set 6 (linear algebra)','in_progress',0,'l',{kind:'date',date:W(1)},'high',180);
task('Read Munkres §26–27','in_progress',1,'t',{kind:'date',date:W(-1)},'normal',60);
task('Fix the gap in the sequential compactness proof','in_progress',2,'a',{kind:'none'},'high',40);
task('Practice ε–δ limits (10 problems)','completed',0,'a',{kind:'date',date:W(-1)},'normal',60);
task('Read Axler ch. 5','completed',1,'l',{kind:'none'},'normal',90);
task('Topology assignment 2','completed',2,'t',{kind:'date',date:W(-4)},'high',120);
task('Old reading list cleanup','cancelled',0,null,{kind:'none'},'low',15);
// ---- deadlines (owner)
const deadlines=[];const dl=(title,kind,due,status,k,mins)=>deadlines.push({id:uid('deadline'),title,kind,due,status,...(k?links[k]:{subjectId:null,projectId:null}),checkpointId:null,
 remainingMinutes:mins,estimateSource:mins===null?null:'owner',origin:'owner',version:1,createdAt:t0,updatedAt:t0});
dl('Real Analysis midterm','exam',{kind:'date',date:'2026-11-23'},'open','a',600);
dl('Topology assignment 3','assignment',{kind:'instant',at:at('2026-11-15',17,30)},'open','t',240);
dl('Linear algebra problem set 6','assignment',{kind:'date',date:W(1)},'open','l',180);
dl('Monoids and groups','milestone',{kind:'date',date:'2026-10-31'},'open',null,null);
dl('Sets, maps, well-definedness','milestone',{kind:'date',date:'2026-10-31'},'open',null,null);
dl('Integers and Z/nZ','milestone',{kind:'date',date:'2026-10-31'},'open',null,null);
dl('Subgroups, cosets, Lagrange, cyclic groups','milestone',{kind:'date',date:'2026-11-01'},'open',null,null);
dl('Seminar abstract','seminar',{kind:'date',date:'2026-11-03'},'done',null,null);
// ---- practice topics
const topics=[];const top=(title,k,cadence,due,last,arch=null)=>topics.push({id:uid('topic'),title,subjectId:k?links[k].subjectId:null,conceptId:null,checkpointId:null,
 cadence,nextDueDate:due,lastPracticedAt:last,archivedAt:arch,version:1,createdAt:t0,updatedAt:t0});
top('ε–δ proofs','a',{kind:'fixed_days',days:3},W(-1),at(W(-4),20,0));
top('Compactness arguments','a',{kind:'after_rating',daysByRating:[1,3,7,14]},TODAY,at(W(-3),9,0));
top('Eigenvalue computations','l',{kind:'fixed_days',days:7},W(3),at(W(-4),16,0));
top('Quotient topology','t',{kind:'after_rating',daysByRating:[1,2,5,10]},W(11),null);
top('Old: set theory warm-ups',null,{kind:'fixed_days',days:14},null,null,at(W(-10),8,0));
// ---- goals
const goals=[];const goal=(period,start,end,mins,k,arch=null)=>goals.push({id:uid('goal'),period,startDate:start,endDate:end,timeZone:'Asia/Kolkata',targetMinutes:mins,
 subjectId:k?links[k].subjectId:null,projectId:k?links[k].projectId:null,archivedAt:arch,version:1,createdAt:t0,updatedAt:t0});
goal('week',TODAY,W(6),600,null);
goal('week',TODAY,W(6),300,'a');
goal('month','2026-11-01','2026-11-30',2400,null);
goal('week',W(-7),W(-1),240,'l');
goal('custom','2026-10-01','2026-10-12',180,null,at('2026-10-13',8,0));
// ---- parked thoughts
const thoughts=[];const th=(text,status='open')=>thoughts.push({id:uid('thought'),text,studyEntryId:null,status,destinationKind:null,destinationId:null,
 resolvedAt:status==='dismissed'?at(W(-1),9,0):null,version:1,createdAt:at(W(-1),8,0),updatedAt:at(W(-1),8,0)});
th('Is the finite intersection property equivalent to compactness for closed sets?');
th('Look up why the Lebesgue number lemma needs sequential compactness');
th('Buy a new notebook');
th('Old idea about product spaces','dismissed');
const out={
 'lemma.v6.demo.study.v1':JSON.stringify({schema:1,entries,blocks}),
 'lemma.v6.demo.tasks.v1':JSON.stringify({schema:1,tasks}),
 'lemma.v6.demo.deadlines.v1':JSON.stringify({schema:1,rows:deadlines}),
 'lemma.v6.demo.practice-topics.v1':JSON.stringify({schema:1,topics,events:[],history:[]}),
 'lemma.v6.demo.study-goals.v1':JSON.stringify({schema:1,goals}),
 'lemma.v6.demo.parked-thoughts.v1':JSON.stringify({schema:1,thoughts}),
};
fs.writeFileSync('seed.json',JSON.stringify(out));
const mins=entries.reduce((a,e)=>a+e.intervals.filter(i=>i.kind==='focus').reduce((x,i)=>x+(Date.parse(i.end)-Date.parse(i.start))/60000,0),0);
console.log('entries',entries.length,'focus minutes',mins,'blocks',blocks.length,'tasks',tasks.length,'deadlines',deadlines.length,'topics',topics.length,'goals',goals.length);
