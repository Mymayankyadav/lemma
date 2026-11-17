// I2: free text never carries a date, a date range, hours per day, or a pace /
// forecast claim. The lint warns and names the structured field to use; it never blocks.
export type LintField='prompt'|'goal'|'target_label'|'diagnostic'|'master_prompt'|'tutor_rules'|'summary';
export type Finding={kind:'date'|'range'|'hours'|'daycount'|'pace';match:string;move_to:string};
const MONTH='(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const RULES:{kind:Finding['kind'];re:RegExp;move:string}[]=[
  {kind:'range',re:new RegExp('\\b\\d{1,2}\\s*(?:-|–|to)\\s*\\d{1,2}\\s+'+MONTH+'\\b(?:\\s+\\d{4})?','gi'),move:'project deadline_at / last_study_on'},
  {kind:'date',re:/\b\d{4}-\d{2}-\d{2}\b/g,move:'project deadline_at / last_study_on'},
  {kind:'date',re:new RegExp('\\b\\d{1,2}(?:st|nd|rd|th)?\\s+'+MONTH+'\\b(?:\\s+\\d{4})?','gi'),move:'project deadline_at / last_study_on'},
  {kind:'date',re:new RegExp('\\b'+MONTH+'\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?','gi'),move:'project deadline_at / last_study_on'},
  {kind:'hours',re:/~?\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|min|mins|minutes?)\s*(?:\/|a|per)\s*(?:day|week)\b/gi,move:'settings.capacity'},
  {kind:'daycount',re:/\b\d+\s*-?\s*days?\s*(?:plan|pass|intensive|sprint|schedule|deep pass)\b|\b\d+-day\b|\bin\s+\d+\s+days\b/gi,move:'project deadline_at (derived by TIME)'},
  {kind:'pace',re:/\b\d+\s+days?\s+(?:behind|ahead)\b|\b(?:behind|ahead of)\s+(?:the\s+)?(?:plan|schedule)\b|\bfinish(?:es|ing)?\s+(?:by|≈|~)|\bscheduled\s+for\s+\d|\bon\s+track\b|\btrack\s+pace\b/gi,move:'get(what=forecast) / TIME'}
];
export function lintText(text:string|null|undefined):Finding[]{
  const out:Finding[]=[];const seen=new Set<string>();const covered:[number,number][]=[];
  const body=String(text??'');
  for(const r of RULES){
    for(const m of body.matchAll(r.re)){
      const at=m.index??0,end=at+m[0].length;
      // A date inside an already-reported range is not a second finding.
      if(r.kind==='date'&&covered.some(([a,b])=>at>=a&&end<=b))continue;
      if(r.kind==='range')covered.push([at,end]);
      const key=r.kind+':'+m[0].toLowerCase();
      if(!seen.has(key)){seen.add(key);out.push({kind:r.kind,match:m[0],move_to:r.move})}
    }
  }
  return out;
}
export const lintOk=(t:string|null|undefined)=>lintText(t).length===0;
/** One terse line for tool output, or '' when clean. */
export function lintNotice(field:LintField,text:string|null|undefined):string{
  const f=lintText(text);
  return f.length?'LINT '+field+' has '+f.slice(0,3).map(x=>'"'+x.match+'"').join(', ')+'; move to '+f[0].move_to+' (I2)':'';
}
