export function day(settings:any, at:Date|number|string=new Date()): string {
  const zone=settings?.time_zone||'UTC', rollover=settings?.rollover_hour??4;
  const now=new Date(at);
  // Format a local wall clock using IANA rules BEFORE applying the rollover.
  // Subtracting hours from UTC first is wrong in Asia/Kolkata and DST zones.
  try {
    const parts=new Intl.DateTimeFormat('en-GB',{
      timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(now);
    const get=(field:string)=>parts.find(x=>x.type===field)?.value||'00';
    const wall=new Date(Date.UTC(Number(get('year')),Number(get('month'))-1,
      Number(get('day')),Number(get('hour')),Number(get('minute')),Number(get('second'))));
    wall.setUTCHours(wall.getUTCHours()-rollover);
    return wall.toISOString().slice(0,10);
  } catch {return new Date(now.getTime()-rollover*3600000).toISOString().slice(0,10)}
}
export function display(s:any): 'ended'|'paused'|'live' {
  if(s.state==='ended')return 'ended';
  return Date.now()-new Date(s.last_activity_at).getTime()>30*60000?'paused':'live';
}
export function ui(cp:any, prereqs:string[],byId:Map<string,any>,today:string):string {
  if(cp.status==='demonstrated')return cp.needs_revisit||(cp.recheck_due&&cp.recheck_due<=today)?'revisit':'done';
  if(cp.status==='in_progress')return 'now';
  return prereqs.every(id=>byId.get(id)?.status==='demonstrated')?'next':'locked';
}
export function ladder(cp:any,outcome:string,today:string): Record<string,unknown> {
  const base=Date.parse(today+'T12:00:00Z');
  const shift=(n:number)=>new Date(base+n*86400000).toISOString().slice(0,10);
  if(outcome==='demonstrated'){
    const level=Math.min(4,(cp.recheck_level||0)+1);
    return {needs_revisit:false,recheck_level:level,recheck_due:level===4?null:shift([3,10,30,90][level])};
  }
  return {needs_revisit:true,recheck_level:0,recheck_due:shift(1)};
}