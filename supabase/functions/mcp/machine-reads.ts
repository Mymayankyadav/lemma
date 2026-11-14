// Incident #1402 (second cause): every tool result gets "\nNEXT: <hint>" appended for the tutor. The JSON reports of the
// N160 `get` reads are read by programs (the deploy's smoke test, other clients), and that line made them invalid JSON.
// These reads return the JSON document and nothing else.
export const MACHINE_READS=new Set(['resources','today','connection','devices','progress','export','calendar_overlaps','source_upload']);
export const isMachineRead=(tool:string,args:{what?:unknown}|null|undefined):boolean=>
 tool==='get'&&typeof args?.what==='string'&&MACHINE_READS.has(args.what);
