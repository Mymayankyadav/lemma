/* Research candidate: wrapper around the frozen cohort. */
import {makeCohort} from './cohort.mjs';

const empty=()=>({keys:[],ghost:null});
const bare=new Set(['eps','epsilon','alpha','beta','lambda','infty','forall','exists','leq','geq','neq','subseteq','supseteq','notin']);
function aliasAllowed(row) {
  const token=(row.span??row.source??'').trim();
  if(row.surface!=='blue'||!bare.has(token)) return true;
  const left=String(row.before??''),right=String(row.after??'');
  if(/(?:brand|product|version|release|identifier|username|package|model|company|search|named|called)\b[^.!?\n]*$/i.test(left) || /^[\w.-]/u.test(right)) return false;
  if(row.mathMode===true || row.mathKey===true || row.provenance==='math-key') return true;
  if(/\b(?:let|choose|fix)\s+$/i.test(left)) return true;
  if(/^\s*(?:[=≠<>≤≥∈∉⊆⊊+*/−-])\s*(?:[A-Za-z0-9α-ωΑ-Ω]|\\)/u.test(right)) return true;
  if(/(?:[=≠<>≤≥∈∉⊆⊊+*/−-])\s*$/u.test(left) && /^\s*(?:[A-Za-z0-9α-ωΑ-Ω]|[=≠<>≤≥∈∉⊆⊊])/u.test(right)) return true;
  return ((left.match(/(?<!\\)\$/g)||[]).length%2===1 && /(?<!\\)\$/.test(right)) || (left.lastIndexOf('\\(')>left.lastIndexOf('\\)') && right.includes('\\)'));
}
function conflict(text) {
  if(typeof text!=='string') return true;
  const formula=text.match(/(?:\b[A-Za-zα-ωΑ-Ω]|\b\d+)\s*(?:=|≠|∈|∉|<|≤|>|≥|⊆|⊊)\s*(?:[A-Za-zα-ωΑ-Ω]\b|\d+\b)/gu)||[];
  const methods=text.match(/\b(?:induction|contradiction|contrapositive|pigeonhole|compactness|symmetry)\b/gi)||[];
  return formula.length>1 || new Set(methods.map(x=>x.toLowerCase())).size>1;
}
// This intentionally covers only a small positive language, not semantic claims.
function neutralPin(pin, options) {
  if(typeof pin!=='string'||pin.length>130||options.origin && options.origin!=='learner' || options.pinOrigin!=='learner') return false;
  if(/["“”`\\\n\d=<>∈∉≤≥⊆⊊]/u.test(pin)||pin.trim()!==pin||pin.split(/\s+/).length>14) return false;
  return /^(?:(?:could|can|would) you (?:please )?(?:repeat|restate|clarify|explain|read|say|show) (?:the |this |that |my )?(?:question|prompt|wording|notation|symbol|word|phrase|sentence)(?: again| more slowly| more clearly| for me| please)?|(?:could|can|may) (?:we|i) (?:please )?(?:pause|wait|read|think)(?: here| a moment| for a moment| again| more slowly)?|please (?:repeat|restate|clarify|explain|read|show) (?:the |this |that )?(?:question|prompt|wording|notation|symbol|word|phrase|sentence)(?: again| more slowly| more clearly| for me| please)?|i (?:am|feel) (?:confused|uncertain|unsure|lost)(?: about (?:the )?(?:wording|question|prompt|notation|symbol|phrase))?|i (?:need|would like|want) (?:a moment|more time|a little more time|a clearer explanation))\s*[.!?]$/i.test(pin);
}
export function makeRevision(phrases,veto,config={}) {
  const base=makeCohort(phrases,veto,config);
  let previousPin=null, previousEngine=null;
  function scoped(opts) {
    const pin=opts?.pinned;
    if(!neutralPin(pin,opts||{})) return {engine:base,pin:null};
    const p=pin.toLowerCase();
    if (p!==previousPin) {
      previousEngine=makeCohort({...phrases,phrases:[...new Set([...(phrases.phrases||[]),p])]},veto,config);
      previousPin=p;
    }
    return {engine:previousEngine,pin};
  }
  function judge(row) {
    if(!row||typeof row!=='object'||!aliasAllowed(row)) return {certified:false,logit:null,passed:false,accepted:false};
    if(['keys','ghost'].includes(row.surface) && conflict(String(row.before??'')+String(row.source??''))) return {certified:false,logit:null,passed:false,accepted:false};
    const {engine,pin}=scoped(row); const r={...row,pinned:null};
    if(pin && pin.toLowerCase().startsWith((String(r.before??'')+String(r.source??'')).toLowerCase())) {r.before=String(r.before).toLowerCase();r.source=String(r.source).toLowerCase();r.proposal=String(r.proposal).toLowerCase();r.pinned=pin.toLowerCase(); if(typeof r.authoredText==='string')r.authoredText=r.authoredText.toLowerCase();}
    let decision=engine.judge(r);
    if(!decision.accepted && r.surface==='ghost' && typeof r.proposal==='string' && /In words, /.test(String(r.before)+String(r.source))) decision=engine.judge({...r,proposal:r.proposal+'.'});
    return decision;
  }
  function edit(row) {if(!row||!aliasAllowed(row)) return null; return base.edit(row);}
  function predict(text,options={}) {
    if(typeof text!=='string'||conflict(text)) return empty();
    const {engine,pin}=scoped(options); let source=text,opts={...options,pinned:null};
    if(pin && text.length>0 && pin.toLowerCase().startsWith(text.toLowerCase()) && pin.startsWith(text)) {source=text.toLowerCase();opts.pinned=pin.toLowerCase();if(typeof opts.authoredText==='string')opts.authoredText=opts.authoredText.toLowerCase();}
    else if(pin) return base.predict(text,{...options,pinned:null});
    let out=engine.predict(source,opts);
    if(pin && (source!==text || pin.startsWith(text))) {
      if(out.ghost) out={...out,ghost:{suffix:pin.slice(text.length,text.length+out.ghost.suffix.length)}};
      if(out.keys?.length) out={...out,keys:out.keys.map(({word})=>({word:pin.slice(text.length-(text.match(/[\p{L}\p{N}]+$/u)?.[0]?.length||0)).match(/^[\p{L}\p{N}]+/u)?.[0]||word}))};
    }
    if(out.ghost && /In words, /.test(text) && out.ghost.suffix.endsWith('.')) out={...out,ghost:{suffix:out.ghost.suffix.slice(0,-1)||''}};
    if(out.ghost && !out.ghost.suffix) return empty();
    return out;
  }
  return {predict,edit,judge,config};
}
export async function createRevision() {
  const files=['runtime-phrases.json','runtime-veto.json','policy.json'];
  const assets=await Promise.all(files.map(async f=>{const r=await fetch(new URL(f,import.meta.url));if(!r.ok)throw Error('Could not load '+f);return r.json();}));
  return makeRevision(...assets);
}
