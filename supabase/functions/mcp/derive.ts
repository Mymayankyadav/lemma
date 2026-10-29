export function day(settings:any): string {
  const zone=settings?.time_zone||'UTC', rollover=settings?.rollover_hour??4;
  const now=new Date(Date.now()-rollover*3600000);
  try { return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
  catch {return now.toISOString().slice(0,10);}
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