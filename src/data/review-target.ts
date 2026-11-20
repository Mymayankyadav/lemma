/** A durable review destination always carries the ID of the selected record. */
export type ReviewTarget={kind:'card'|'path'|'checkpoint'|'concept'|'round';id:string};
export type ReviewDomainTarget=ReviewTarget&{kind:Exclude<ReviewTarget['kind'],'round'>};
export function reviewTarget(kind:unknown,id:unknown):ReviewTarget{
 if(typeof id!=='string'||!id.trim()||id.length>160||
    kind!=='card'&&kind!=='path'&&kind!=='checkpoint'&&kind!=='concept'&&kind!=='round')throw Error('Review target unavailable');
 return {kind,id};
}
export function reviewHref(target:ReviewTarget){
 return target.kind==='round'?'/review/run?run='+encodeURIComponent(target.id):
  '/review/run?target='+target.kind+'&id='+encodeURIComponent(target.id);
}
