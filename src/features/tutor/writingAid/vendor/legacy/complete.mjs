/* Only approved neutral phrases and exact transcriptions of learner formulas. */
const DEFAULTS = {window:4, keysMinChars:1, ghostMinWords:1, ranker:'conditional'};
const rels = {'=':'equals','≠':'does not equal','∈':'is an element of','∉':'is not an element of','<':'is less than','≤':'is less than or equal to','>':'is greater than','≥':'is greater than or equal to','⊆':'is a subset of','⊊':'is a proper subset of'};
const operand = '(?:[A-Za-zα-ωΑ-Ω]|[0-9]+)';
const formulaRE = new RegExp(`^(${operand})\\s*(=|≠|∈|∉|<|≤|>|≥|⊆|⊊)\\s*(${operand})\\. (In words, .*)$`, 'u');
const words = s => s.match(/[\p{L}\p{N}]+/gu) || [];
export const countOutputTokens = s => (typeof s === 'string' ? (s.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || []).length : 0);
function budgetFor(a, opts, cfg) {
  if (a.formula || (typeof opts.pinned==='string' && a.phrases.some(p=>pinnedFirst(p,opts.pinned,opts.model)))) return 16;
  const n=words(a.prefix).length;
  if (cfg.outputPolicy==='fixed') return 16;
  const strict=cfg.outputPolicy==='strict';
  return n<=2 ? (strict?2:3) : n<=4 ? (strict?4:6) : (strict?10:16);
}
function commonSuffix(a) {
  const suffixes=a.phrases.map(p=>p.slice(a.prefix.length));
  let common=suffixes[0]||'';
  for (const s of suffixes.slice(1)) {let i=0; while(i<common.length && i<s.length && common[i]===s[i]) i++; common=common.slice(0,i);}
  // Never expose a partial word where intentions diverge.
  if (suffixes.some(s=>s.length>common.length && /[\p{L}\p{N}]/u.test(s[common.length]||'')) && /[\p{L}\p{N}]$/u.test(common)) common=common.replace(/[\p{L}\p{N}]+$/u,'');
  return common;
}
function cappedSuffix(a,opts,cfg) {
  let s=commonSuffix(a); let budget=budgetFor(a,opts,cfg);
  if (typeof opts.authoredText==='string' && typeof opts.text==='string' && opts.text.startsWith(opts.authoredText)) {const initial=valid(opts.authoredText,opts,opts.model); budget=Math.max(0,budgetFor(initial,opts,cfg)-countOutputTokens(opts.text.slice(opts.authoredText.length)));}
  const re=/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu; let m, n=0, end=0;
  while((m=re.exec(s)) && n<budget) { n++; end=re.lastIndex; }
  s=s.slice(0,end); return /[\p{L}\p{N}]/u.test(s) ? s : '';
}
function registry(model) { return Array.isArray(model?.phrases) ? model.phrases.filter(x=>typeof x==='string') : []; }
function active(text, model, scope="line") {
  // Prior sentences must themselves be approved complete sentences. This avoids
  // treating an unsafe clause, quotation, or code as a fresh completion context.
  let before='', rest=text;
  for (;;) {
    const previous=registry(model).find(p=>rest.toLowerCase().startsWith(p+' ') || rest.toLowerCase().startsWith(p+'\n'));
    if (!previous) break;
    const n=previous.length+1; before+=rest.slice(0,n); rest=rest.slice(n);
  }
  if(scope==='sentence' && before==='' && !/[`"“”‘’]/u.test(text)) {
    const boundary=/[.!?]\s+|\n+/gu; let match, last=null;
    while((match=boundary.exec(text))) last={end:boundary.lastIndex};
    if(last) {
      const fm=text.match(new RegExp(`(?:^|[.!?]\\s+|\\n+)(${operand}\\s*(?:=|≠|∈|∉|<|≤|>|≥|⊆|⊊)\\s*${operand}\\. In words, .*)$`, 'u'));
      const candidate=fm ? fm[1] : text.slice(last.end), prior=fm ? text.slice(0,text.length-candidate.length) : text.slice(0,last.end);
      const safePrior=!/(?:^|\n)\s*(?:prompt|source|tutor|teacher|question|quote|example)\s*:/iu.test(prior) && !/\b(?:tutor|teacher)\s+(?:said|wrote|asked)|\b(?:if|unless|when|suppose|assuming)\b[^.!?\n]*$/iu.test(prior.trim());
      const strong=candidate.length>=5 && (formulaRE.test(candidate) || registry(model).some(p=>p.startsWith(candidate.toLowerCase())));
      if(safePrior && strong) {before=prior;rest=candidate;}
    }
  }
  // Only explicit first-person authorship labels may precede a source formula.
  const label=rest.match(/^(?:I (?:wrote|typed)|My (?:notation|line)): /u)?.[0] || '';
  if(label && formulaRE.test(rest.slice(label.length))) {before+=label;rest=rest.slice(label.length);}
  const f=rest.match(formulaRE);
  if(f) {
    const [,left,op,right,prefix]=f;
    const sentence=`In words, ${left} ${rels[op]} ${right}.`;
    const start=rest.length-prefix.length;
    return {before:before+rest.slice(0,start), prefix, phrases:sentence.startsWith(prefix)?[sentence]:[], formula:true};
  }
  const caps=/^[A-Z]/.test(rest);
  const phrases=registry(model).map(p=>caps?p[0].toUpperCase()+p.slice(1):p).filter(p=>p.startsWith(rest));
  return {before,prefix:rest,phrases,formula:false};
}
// Reviewed orthographic vocabulary, not an inference or terminology generator.
const SPELLINGS = ['denominator','numerator','coefficient','fraction','fractional','decimal','equation','expression','notation','variable','integer','polynomial','sequence','function','element','interval','symbol','bracket','parenthesis','remainder','quantity'];
function spelling(text,opts) {
  if(typeof text!=='string'||text.length>1024||opts.origin!=='learner'||/[`"“”]/u.test(text)) return null;
  const m=text.match(/([A-Za-z]+)$/); if(!m) return null;
  const prefix=m[1], before=text.slice(0,-prefix.length);
  if(prefix.length<5 || !/^[a-z]+$/.test(prefix) || (before && !/[\s.,!?;:()]/u.test(before.at(-1)))) return null;
  // Avoid code/math identifiers, declaration contexts, and partial names.
  if(/[=<>∈∉≤≥⊆⊊_\\]/u.test(text) || /\b(?:let|define|named|called|name|variable|theorem|lemma|proof|assume|choose|witness)\s+(?:a\s+|an\s+|the\s+)?$/iu.test(before)) return null;
  if(SPELLINGS.includes(prefix)) return null;
  const matches=SPELLINGS.filter(w=>w.startsWith(prefix) && w.length>prefix.length && prefix.length/w.length>=2/3);
  return matches.length===1 ? matches[0] : null;
}
export function observation(text,surface='keys',model={},config={}) {
  if(typeof text!=='string') return {before:'',source:''};
  if(surface==='ghost') { const a=active(text,model,config.scope); return {before:a.before,source:a.prefix}; }
  const source=text.match(/[\p{L}\p{N}]+$/u)?.[0] || '';
  return {before:text.slice(0,text.length-source.length),source};
}
export const composition=observation;
function nextWord(phrase,prefix) {
  const suffix=phrase.slice(prefix.length), current=prefix.match(/[\p{L}\p{N}]+$/u)?.[0] || '';
  if(current) return current+(suffix.match(/^[\p{L}\p{N}]*/u)?.[0]||'');
  return suffix.match(/^\s*([\p{L}\p{N}]+)/u)?.[1] || null;
}
function score(word,prefix,model,cfg) {
  const w=word.toLowerCase(), freq=model?.frequency?.[w]||0;
  if(cfg.ranker==='frequency') return freq;
  const prev=prefix.toLowerCase().replace(/[\p{L}\p{N}]+$/u,'').trim().split(/\s+/).filter(Boolean).slice(-cfg.window).join(' ');
  return (model?.conditional?.[`${cfg.window}\t${prev}\t${w}`]||0)*10000+freq;
}
function valid(text,opts,model) { return typeof text==='string' && text.length<=1024 && opts.origin==='learner' ? active(text,model,opts.scope) : {prefix:'',phrases:[]}; }
function pinnedFirst(phrase,pin,model) { return typeof pin==='string' && registry(model).includes(pin) && phrase.toLowerCase()===pin; }
export function complete(text,options={},model={},config={}) {
  const opts={surface:'keys',origin:'learner',pinned:null,...options,model}, cfg={...DEFAULTS,outputPolicy:'adaptive',...config};
  opts.scope=cfg.scope; opts.text=text; const a=valid(text,opts,model);
  if (typeof opts.pinned==='string' && registry(model).includes(opts.pinned)) {const pinned=a.phrases.filter(p=>pinnedFirst(p,opts.pinned,model)); if(pinned.length) a.phrases=pinned;}
  if (typeof opts.authoredText === 'string') {
    if (!text.startsWith(opts.authoredText)) return {keys:[],ghost:null};
    const initial=valid(opts.authoredText,opts,model), used=countOutputTokens(text.slice(opts.authoredText.length));
    if (!initial.phrases.length && !spelling(opts.authoredText,opts)) return {keys:[],ghost:null};
    if (used >= (initial.phrases.length ? budgetFor(initial,opts,cfg) : 1)) return {keys:[],ghost:null};
  }
  if(!a.phrases.length) {const word=opts.surface==='keys' ? spelling(text,opts) : null; return {keys:word?[{word}]:[],ghost:null,...(word?{meta:{lane:'orthographic',budget:1}}:{})};}
  if(opts.surface==='keys') {
    if(a.prefix.trim().length<cfg.keysMinChars) return {keys:[],ghost:null};
    const current=a.prefix.match(/[\p{L}\p{N}]+$/u)?.[0]||'', map=new Map();
    for(const phrase of a.phrases) {const word=nextWord(phrase,a.prefix); if(word && word.length>current.length) {const s=score(word,a.prefix,model,cfg)+(pinnedFirst(phrase,opts.pinned,model)?1e12:0); map.set(word,Math.max(map.get(word)??-Infinity,s));}}
    return {keys:[...map].sort((x,y)=>y[1]-x[1]||x[0].localeCompare(y[0])).slice(0,3).map(([word])=>({word})),ghost:null};
  }
  if(opts.surface!=='ghost' || (a.prefix.replace(/\s/g,'').length<4 && words(a.prefix).length<2) || words(a.prefix).length<cfg.ghostMinWords) return {keys:[],ghost:null};
  const suffix=cappedSuffix(a,opts,cfg);
  return {keys:[],ghost:suffix && (suffix.replace(/\s/g,'').length>=4 || words(suffix).length>=2)?{suffix}:null};
}
// Replaces a partial word or inserts at a boundary, then provides a space for
// the next tap. Existing right context is preserved when caret is supplied.
export function applyWord(text,word,caret=text.length) {
  if(typeof text!=='string'||typeof word!=='string'||!Number.isInteger(caret)||caret<0||caret>text.length||! /^[\p{L}\p{N}]+$/u.test(word)) return text;
  const left=text.slice(0,caret), right=text.slice(caret), partial=left.match(/[\p{L}\p{N}]+$/u)?.[0]||'';
  if(partial && !word.startsWith(partial)) return text;
  const start=left.slice(0,left.length-partial.length);
  const gap=!partial && start && !/\s$/u.test(start) ? ' ' : '';
  return start+gap+word+(right && /^[\s.,!?;:]/u.test(right)?'':' ')+right;
}
export const keyInsertion=applyWord;
export function completionCertificate(row,model={},config={}) {
  if(!row||typeof row.before!=='string'||typeof row.source!=='string'||typeof row.proposal!=='string'||row.after!==''||!['keys','ghost'].includes(row.surface)) return false;
  const text=row.before+row.source, opts={origin:row.origin??'learner',pinned:row.pinned??null,authoredText:row.authoredText,model}, cfg={...DEFAULTS,outputPolicy:'adaptive',...config};
  opts.scope=cfg.scope;
  if (typeof opts.authoredText==='string') {const initial=valid(opts.authoredText,opts,model); if (!text.startsWith(opts.authoredText) || (!initial.phrases.length && !spelling(opts.authoredText,opts)) || countOutputTokens(text.slice(opts.authoredText.length)) >= (initial.phrases.length ? budgetFor(initial,opts,cfg) : 1)) return false;}
  opts.scope=cfg.scope; opts.text=text; const a=valid(text,opts,model); if (typeof opts.pinned==='string' && registry(model).includes(opts.pinned)) {const pinned=a.phrases.filter(p=>pinnedFirst(p,opts.pinned,model)); if(pinned.length) a.phrases=pinned;} if(!a.phrases.length) return row.surface==='keys' && spelling(text,opts)===row.proposal;
  if(row.surface==='ghost') {
    if((a.prefix.replace(/\s/g,'').length<4 && words(a.prefix).length<2)||words(a.prefix).length<(config.ghostMinWords??1)) return false;
    return row.proposal!=='' && (row.proposal.replace(/\s/g,'').length>=4 || words(row.proposal).length>=2) && row.proposal===cappedSuffix(a,opts,cfg);
  }
  if(a.prefix.trim().length<(config.keysMinChars??1)) return false;
  const current=a.prefix.match(/[\p{L}\p{N}]+$/u)?.[0]||'';
  return a.phrases.some(p=>{const w=nextWord(p,a.prefix);return w===row.proposal && w.length>current.length;});
}

