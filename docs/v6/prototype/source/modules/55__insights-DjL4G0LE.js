import{o as e,s as t}from"@lemma/derive-BTXnCYPV.js";function n(e){return[`sure`,`unsure`,`guess`].map(t=>{let n=e.filter(e=>e.confidence===t),r=n.filter(e=>e.rating>1).length;return{confidence:t,total:n.length,right:r,rate:n.length?r/n.length:null}})}var r=e=>e.length?e.filter(e=>e.rating>1).length/e.length:null;function i(e){let t=e.filter(Number.isFinite).sort((e,t)=>e-t),n=Math.floor(t.length/2);return t.length?t.length%2?t[n]:(t[n-1]+t[n])/2:null}function a(e){let t=e.find(e=>e.confidence===`sure`),n=e.find(e=>e.confidence===`unsure`),r=e.find(e=>e.confidence===`guess`);if(e.reduce((sum,item)=>sum+(item.total||0),0)<20)return null;return t?.rate!=null&&t.rate<.75?`Your sure answers miss often.`:n?.rate!=null&&n.rate>=.85?`Self-ratings suggest recall may exceed your expectation.`:t?.rate!=null&&r?.rate!=null&&t.rate>=.85&&r.rate<=.6?`Close to ideal.`:null}function o(e,t=0){let i=n(e),a=i[0];return{count:e.length,recall:r(e),durationMs:e.reduce((e,t)=>e+Math.max(0,t.durationMs),0),again:e.filter(e=>e.rating===1).length,lapses:e.filter(e=>e.rating===1&&e.stateBefore===2).length,calibration:i,sureSummary:a.total>=5?`When sure, right ${a.right} of ${a.total}`:null,dueTomorrow:t}}function s(e,t=[]){let n=t.filter(e=>e.durationMs>0&&e.durationMs<=6e5),r=n.length?n.reduce((e,t)=>e+t.durationMs,0)/n.length:25e3;return Math.ceil(Math.max(0,e)*r/6e4)}// W01: source-backed optimizer eligibility matches the worker's rule:
// usable *subsequent* card reviews separated by at least one local study day.
// Raw review totals are not optimizer-eligible training examples.
function eligibleReviews(records,settings={}){
  if(!Array.isArray(records))return {status:`unavailable`,eligible:null,total:null,excluded:null};
  const tz=settings.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||`UTC`;
  const rollover=Number.isInteger(settings.rolloverHour)?settings.rolloverHour:4;
  let formatter;
  try{formatter=new Intl.DateTimeFormat(`en-GB`,{timeZone:tz,year:`numeric`,month:`2-digit`,day:`2-digit`,hour:`2-digit`,hourCycle:`h23`})}
  catch{return {status:`unavailable`,eligible:null,total:null,excluded:null}}
  function studyDay(value){
    const d=new Date(value);
    if(!Number.isFinite(d.getTime()))return null;
    const f=Object.fromEntries(formatter.formatToParts(d).map(x=>[x.type,x.value]));
    const day=Math.floor(Date.UTC(+f.year,+f.month-1,+f.day)/86400000);
    return day-(+f.hour<rollover?1:0);
  }
  const byCard=new Map();let valid=0;
  for(const record of records){
    if(!record||!record.cardId||!Number.isInteger(Number(record.rating))||+record.rating<1||+record.rating>4)continue;
    const day=studyDay(record.reviewedAt);if(day==null)continue;
    valid++;
    const arr=byCard.get(String(record.cardId))||[];
    arr.push({day,timestamp:Date.parse(record.reviewedAt)});
    byCard.set(String(record.cardId),arr);
  }
  let eligible=0;
  for(const card of byCard.values()){
    card.sort((a,b)=>a.timestamp-b.timestamp);
    for(let i=1;i<card.length;i++)if(card[i].day>card[i-1].day)eligible++;
  }
  return {status:`ready`,eligible,total:records.length,excluded:records.length-eligible,
    sameDayOrFirst:valid-eligible,invalid:records.length-valid,threshold:400,
    complete:true,timeZone:tz,rolloverHour:rollover};
}
function c(e,t){
 const bucketSize=t===7?1:t===30?6:7;
 // This adapter's aggregate comes from getInsightData(t); trust its filtered
 // topline and use its daily rows, not an independently invented 28-day range.
 const days=Array.isArray(e.reviewDays)?e.reviewDays.slice(-t):[];
 const checkpointDays=Array.isArray(e.checkpointDays)?e.checkpointDays.slice(-t):[];
 const makeBuckets=(rows,size)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>{
   const items=rows.slice(index*size,(index+1)*size),sum=field=>items.reduce((total,item)=>total+(Number(item[field])||0),0),count=sum(`count`);
   return {date:items[0]?.date??``,endDate:items.at(-1)?.date??``,count,
     recall:count?sum(`right`)/count:null,again:sum(`again`),hard:sum(`hard`),good:sum(`good`),easy:sum(`easy`)};
 });
 const calibration=[`sure`,`unsure`,`guess`].map(confidence=>{
   const item=e.calibration.find(row=>row.confidence===confidence),total=item?.total??0,right=item?.right??0;
   return {confidence,total,right,rate:total?right/total:null};
 });
 const checkpointWeeks=Array.from({length:Math.ceil(checkpointDays.length/bucketSize)},(_,idx)=>{
   const rows=checkpointDays.slice(idx*bucketSize,(idx+1)*bucketSize);
   return {label:`Period ${idx+1}`,date:rows[0]?.date??``,endDate:rows.at(-1)?.date??``,
     demonstrated:rows.reduce((n,row)=>n+(Number(row.demonstrated)||0),0),
     rechecked:rows.reduce((n,row)=>n+(Number(row.rechecked)||0),0)};
 });
 return {days:t,minutes:e.minutes,sessions:e.sessions,reviews:e.reviews,
   recall:e.reviews?e.right/e.reviews:null,recallBuckets:makeBuckets(days,bucketSize),
   reviewBuckets:makeBuckets(days,bucketSize),calibration,calibrationMessage:a(calibration),
   subjects:[...e.subjectMinutes].sort((a,b)=>b.minutes-a.minutes),checkpointWeeks,
   typicalSession:e.typicalSession,mostRevisited:e.mostRevisited};
}
function l(source,days,opts={}){
 if(source.aggregate)return {...c(source.aggregate,days),...(window.__lemmaNotebook?.selectTime(days,opts.now??Date.now())||{})};
 const at=opts.now??Date.now(),clock=t(opts.rolloverHour??4,opts.timeZone??`UTC`),today=clock.dayIndex(at);
 const first=today-days+1;
 const date=index=>new Date(index*86400000).toISOString().slice(0,10);
 const within=timestamp=>{const instant=Date.parse(timestamp);return Number.isFinite(instant)&&instant<=at&&clock.dayIndex(instant)>=first&&clock.dayIndex(instant)<=today};
 const reviews=source.reviews.filter(e=>within(e.reviewedAt));
 const sessions=source.sessions.filter(e=>within(e.startedAt));
 const bucketSize=days===7?1:days===30?6:7;
 const intervals=Array.from({length:Math.ceil(days/bucketSize)},(_,idx)=>{
   const start=first+idx*bucketSize,end=Math.min(today+1,start+bucketSize);
   return {start,end,date:date(start),endDate:date(end-1),label:`Period ${idx+1}`};
 });
 const reviewBuckets=intervals.map(({start,end,date,endDate})=>{
   const items=reviews.filter(x=>{const d=clock.dayIndex(Date.parse(x.reviewedAt));return d>=start&&d<end});
   return {date,endDate,count:items.length,recall:r(items),again:items.filter(x=>x.rating===1).length,
     hard:items.filter(x=>x.rating===2).length,good:items.filter(x=>x.rating===3).length,
     easy:items.filter(x=>x.rating===4).length};
 });
 const projectById=new Map(source.projects.map(p=>[p.id,p])),subjectMinutes=new Map();
 for(const session of sessions){
   const subject=projectById.get(session.projectId)?.subject;
   if(!subject)continue;
   const prior=subjectMinutes.get(subject.id)??{subject,minutes:0};
   prior.minutes+=Number(session.minutes)||0;
   subjectMinutes.set(subject.id,prior);
 }
 const checkpointWeeks=intervals.map(({start,end,date,endDate,label})=>{
   const items=source.checkpointEvents.filter(ev=>{
     const instant=Date.parse(ev.at),index=clock.dayIndex(instant);
     return Number.isFinite(instant)&&instant<=at&&index>=start&&index<end;
   });
   return {date,endDate,label,demonstrated:items.filter(e=>e.kind===`demonstrated`).length,
     rechecked:items.filter(e=>e.kind===`recheck_ok`||e.kind===`recheck_fail`).length};
 });
 const calibration=n(reviews);
 return {days,minutes:sessions.reduce((sum,e)=>sum+(Number(e.minutes)||0),0),
   sessions:sessions.length,reviews:reviews.length,recall:r(reviews),
   recallBuckets:reviewBuckets,reviewBuckets,calibration,calibrationMessage:a(calibration),
   subjects:[...subjectMinutes.values()].sort((a,b)=>b.minutes-a.minutes),
   checkpointWeeks,typicalSession:i(sessions.map(e=>e.minutes)),
   mostRevisited:[...source.misconceptions].sort((a,b)=>b.times-a.times||a.label.localeCompare(b.label))[0]??null,...(window.__lemmaNotebook?.selectTime(days,at)||{})};
}
export{s as n,o as r,l as t,eligibleReviews as eligibleForTuning};