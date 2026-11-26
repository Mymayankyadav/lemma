// Advertised tool schema only: zod still validates every call with the full schema (see lean() in server.ts).
const SAFE_INT=Number.MAX_SAFE_INTEGER;
export function prune(node:any):any{
  if(Array.isArray(node))return node.map(prune);
  if(!node||typeof node!=='object')return node;
  const out:any={};
  for(const [k,v] of Object.entries(node)){
    if(k==='$schema')continue;
    if((k==='maximum'&&v===SAFE_INT)||(k==='minimum'&&v===-SAFE_INT))continue;
    // Incident #1492: "non-empty" (minLength 1) is advertised 36 times; zod still enforces it on every call, so leave it out of tools/list.
    if(k==='minLength'&&v===1)continue;
    // Zod advertises UUIDs with both format and its long equivalent pattern.
    // Keep the format; the original schema still validates every request.
    if(k==='pattern'&&node.format==='uuid')continue;
    out[k]=prune(v);
  }
  return out;
}
