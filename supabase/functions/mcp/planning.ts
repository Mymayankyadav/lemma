// Validate dynamic edit/operation fields as well as typed MCP inputs.
export function planningFields(value:any):void {
 for(const [key,max] of [['stage',40],['topic',40],['target_label',20]] as const){
  if(value[key]!==undefined&&value[key]!==null&&(typeof value[key]!=='string'||value[key].length>max))throw Error(key+' must be text of at most '+max+' characters or null');
 }
 if(value.due_on!==undefined&&value.due_on!==null){
  const date=value.due_on;
  if(typeof date!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
   throw Error('due_on must be a valid YYYY-MM-DD date or null');
 }
 if(value.target_date!==undefined&&value.target_date!==null){
  const s=value.target_date;
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('target_date must be a valid YYYY-MM-DD date or null');
 }
}
