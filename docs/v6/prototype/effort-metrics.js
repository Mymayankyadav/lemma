/* A single read-only definition of logged effort. Overlapping saved intervals
   count once, live time stays separate, and invalid records remain inspectable. */
const lemmaEffortSelector=(()=>{
  const asMs=value=>value==null||value===''?NaN:typeof value==='number'?value:Date.parse(value);
  const dayBounds=day=>{
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(day||'');if(!match)return null;
    const [year,month,date]=match.slice(1).map(Number),from=new Date(year,month-1,date),to=new Date(year,month-1,date+1);
    return from.getFullYear()===year&&from.getMonth()+1===month&&from.getDate()===date?{from:+from,to:+to}:null;
  };
  const unique=entries=>{const seen=new Set();return(Array.isArray(entries)?entries:[]).filter(entry=>{
    if(!entry||typeof entry!=='object')return false;
    const key=entry.id!=null?`id:${entry.id}`:JSON.stringify([entry.sessionId,entry.date,entry.start,entry.end,entry.min,entry.title,entry.subject]);
    if(seen.has(key))return false;seen.add(key);return true;
  })};
  const union=intervals=>{const result=[];for(const part of [...intervals].sort((a,b)=>a.start-b.start||a.end-b.end)){
    const last=result.at(-1);if(last&&part.start<=last.end)last.end=Math.max(last.end,part.end);else result.push({...part});
  }return result};
  function intervalsFor(entry){
    let raw=Array.isArray(entry.intervals)&&entry.intervals.length?entry.intervals:entry.startInstant&&entry.endInstant?[{start:entry.startInstant,end:entry.endInstant}]:[];
    if(!raw.length&&dayBounds(entry.date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.start||'')){
      const start=+new Date(entry.date+'T'+entry.start+':00');let end;
      if(/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.end||'')){end=+new Date(entry.date+'T'+entry.end+':00');if(end<=start){const d=new Date(end);d.setDate(d.getDate()+1);end=+d}}
      else end=start+Number(entry.min??entry.minutes)*60000;
      raw=[{start,end}];
    }
    return union(raw.map(x=>({start:asMs(x?.start),end:asMs(x?.end)})).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start&&x.end-x.start<=86400000));
  }
  const pastIntervals=(entry,now=Date.now())=>intervalsFor(entry).map(part=>({start:part.start,end:Math.min(part.end,now)})).filter(part=>part.end>part.start);
  function sum(entries,day,range,now=Date.now()){
    const bounds=range||(day?dayBounds(day):null),parts=[],hours=new Set(),unplacedDays=new Map();let rawMillis=0,unplaced=0,records=0,approximate=0,invalid=0,futureRecords=0,futureMinutes=0;
    for(const entry of unique(entries)){
      const source=intervalsFor(entry);let counted=false,future=false;
      if(source.length){
        for(const part of source){const start=bounds?Math.max(bounds.from,part.start):part.start,scopeEnd=bounds?Math.min(bounds.to,part.end):part.end,end=Math.min(scopeEnd,now);
          if(scopeEnd>Math.max(start,now)){future=true;futureMinutes+=(scopeEnd-Math.max(start,now))/60000}
          if(end<=start)continue;parts.push({start,end});rawMillis+=end-start;counted=true;
          if(day){for(let t=start;t<end;t+=900000)hours.add(new Date(t).getHours());hours.add(new Date(end-1).getHours())}
        }
      }else if((!day||entry.date===day)&&(!range||dayBounds(entry.date)&&dayBounds(entry.date).from>=range.from&&dayBounds(entry.date).from<range.to)){
        const duration=Number(entry.min??entry.minutes);
        if(!dayBounds(entry.date)||!Number.isFinite(duration)||duration<0||duration>1440){invalid++;continue}
        if(duration>0){if(dayBounds(entry.date).from>=now){future=true;futureMinutes+=duration}else{unplacedDays.set(entry.date,(unplacedDays.get(entry.date)||0)+duration*60000);counted=true;approximate++}}
      }
      if(future)futureRecords++;
      if(counted){records++;if(entry.timeApproximate||(!entry.intervals?.length&&!entry.startInstant&&source.length))approximate++}
    }
    const merged=union(parts),covered=merged.reduce((n,x)=>n+x.end-x.start,0),capacity=bounds?Math.max(0,Math.min(bounds.to,now)-bounds.from):Infinity;
    let excess=0;for(const [date,claimed] of unplacedDays){const d=dayBounds(date),from=bounds?Math.max(bounds.from,d.from):d.from,to=Math.min(now,bounds?Math.min(bounds.to,d.to):d.to);const placed=merged.reduce((n,p)=>n+Math.max(0,Math.min(to,p.end)-Math.max(from,p.start)),0),remaining=Math.max(0,to-from-placed);unplaced+=Math.min(remaining,claimed);excess+=Math.max(0,claimed-remaining)}
    const claimed=covered+unplaced,millis=Math.min(capacity,claimed);

    return{minutes:millis/60000,hours:[...hours].sort((a,b)=>a-b),records,approximate,invalid,futureRecords,futureMinutes,excessMinutes:excess/60000,
      overlapMinutes:Math.max(0,(rawMillis-covered)/60000),needsReview:invalid>0||futureRecords>0||excess>0||claimed>capacity||rawMillis-covered>59999};
  }
  function active(timer,now=Date.now(),entries=[]){
    if(!timer||(!timer.running&&!timer.paused)||timer.sessionId&&unique(entries).some(e=>e.sessionId===timer.sessionId))return 0;
    const advance=timer.running&&timer.phase!=='break'?Math.max(0,now-(Number(timer.stamp)||now))/1000:0;
    const minutes=(timer.phase==='break'?Math.max(0,Number(timer.studyElapsed)||0):Math.max(0,Number(timer.elapsed)||0)+advance)/60;
    return timer.mode==='pomo'?Math.min(minutes,Math.max(1,Number(timer.focus)||50)):minutes;
  }
  function result(saved,timer,entries,scope,now){return Object.freeze({scope,asOf:new Date(now).toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',
    provenance:'saved-notebook-records',loadState:'ready',committedMinutes:saved.minutes,inProgressMinutes:active(timer,now,entries),committedRecords:saved.records,
    approximateRecords:saved.approximate,invalidRecords:saved.invalid,futureRecords:saved.futureRecords,futureMinutes:saved.futureMinutes,excessMinutes:saved.excessMinutes,overlapMinutes:saved.overlapMinutes,needsReview:saved.needsReview,loggedHours:saved.hours})}
  function forDay(entries,timer,day,now=Date.now()){return result(sum(entries,day,null,now),timer,entries,{day},now)}
  function forRange(entries,days,now=Date.now()){
    const end=new Date(now);end.setHours(24,0,0,0);const start=new Date(end);start.setDate(start.getDate()-days);
    return result(sum(entries,null,{from:+start,to:+end},now),null,entries,{days,from:+start,to:+end},now);
  }
  function allTime(entries,now=Date.now()){const saved=sum(entries,null,null,now);return{committedMinutes:saved.minutes,committedRecords:saved.records,approximateRecords:saved.approximate,invalidRecords:saved.invalid,futureRecords:saved.futureRecords,futureMinutes:saved.futureMinutes,excessMinutes:saved.excessMinutes,needsReview:saved.needsReview,overlapMinutes:saved.overlapMinutes}}
  return Object.freeze({forDay,forRange,allTime,active,dayBounds,intervalsFor,pastIntervals,uniqueEntries:unique,union});
})();
window.__lemmaEffortMetrics=lemmaEffortSelector;
