import {makeSpeedAid} from './facade.mjs';
import {permitWord} from './commitment.mjs';

// These are words about writing. They may be finished early in the balanced
// keyboard when the learner has started typing them. No operands or methods.
const writingWords=new Set(('again already answer asking asked before below called calling check checking checked clear clearly comment comments compare comparing copied copy copying correctly described describing description diagram diagrams displayed draft drafted drafting earlier equation equations example examples explain explained explaining explanation expression expressions figure figures first following form format formatted formatting here handwritten labeled label labels last later letter letters line lines marked marking marks meaning mention mentioned mixed myself name named names naming next notation notes note numbered numbering paragraph paragraphs part parts passage passages please previous previously question questions read reading record recorded recording reference referenced references referring repeat repeated repeating repetition restate restated restating rewrite rewriting scratch second sentence sentences separately shown space spaces spelling spelled statement statements symbol symbols term terms text texts together typed typing under underline underlined verify version versions word wording words work write writer writing written wrote').split(' '));
const exactName='[A-Z](?:_[0-9]+)?';
const evidenceGap=/(?:\b(?:in|from|outside)\s+|(?:belongs to|is an element of|is a subset of|one of|between|classify (?:it )?as|label (?:it )?as)\s+|[∈∉⊆⊊⊂]\s*)$/iu;
const sourceMarker=/(?:^|\s)(?:tutor|teacher|instructor|assistant|solution|system|prompt|quotation)\s*:|\b(?:tutor|teacher|assistant|book|solution|prompt)\s+(?:said|says|wrote|suggested|mentions?|mentioned|gives?|gave|uses?)\b/iu;
const empty=()=>({keys:[],ghost:null});

function learnerProse(text) {
  return text.replace(/```[\s\S]*?(?:```|$)|`[^`]*(?:`|$)|"[^"\n]*(?:"|$)|“[^”]*(?:”|$)|‘[^’]*(?:’|$)|(?:^|\s)'[^'\n]{1,200}'(?=\s|[.,;:]|$)/gu,' ')
    .split(/\n+/u).filter(line=>!sourceMarker.test(line))
    .join(' ');
}

function suppliedNames(text) {
  const clean=learnerProse(text), names=new Set(), labels=[];
  const list=/\b(?:my (?:options|choices|labels) (?:are|were)|I (?:listed|named) (?:the )?(?:options|choices|labels)|I (?:am choosing|choose) between)\s*:?\s+([\p{L}][\p{L}\p{N}_-]*(?:(?:\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)[\p{L}][\p{L}\p{N}_-]*){1,5})(?=[.;!?]|$)/giu;
  for(const m of clean.matchAll(list))labels.push(m[1].split(/\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/iu));
  const membership=new RegExp('(?:[∈∉⊆⊊⊂]\\s*|\\b(?:in|outside) (?:the set )?)('+exactName+')(?![\\p{L}\\p{N}_])','gu');
  for(const m of clean.matchAll(membership))if(m[1]!=='I')names.add(m[1]);
  for(const m of clean.matchAll(/\b(?:[Ll]et|[Tt]ake|[Dd]efine|[Gg]iven|[Ss]ets)\s+([A-Z](?:_\d+)?(?:(?:\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)[A-Z](?:_\d+)?){0,8})\s*(?:be\b|are\b|denote\b|=|∈)/gu)){
    for(const n of m[1].match(/[A-Z](?:_\d+)?/gu)||[])if(n!=='I')names.add(n);
  }
  for(const m of clean.matchAll(/(?:^|[^\p{L}\p{N}_])([A-Z](?:_\d+)?)\s*(?:[:=]\s*(?:\{|\[|\()|\bcontains?\b)/gu))if(m[1]!=='I')names.add(m[1]);
  if (labels.length>1)return [];
  const values=labels.length?labels[0]:[...names];
  return [...new Set(values)].sort((a,b)=>a<b?-1:a>b?1:0);
}
function coin(seed,sorted) {
  let hash=((seed>>>1)^2166136261)>>>0;
  for(const c of sorted.join('|'))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
  return ((hash>>>8)&1)^(seed&1);
}
function studentChoices(text,opts,seed) {
  if(!evidenceGap.test(text))return undefined;
  const author=opts.authoredText, line=text.slice(text.lastIndexOf('\n')+1);
  const clause=line.split(/[.!?]\s+/u).at(-1);
  if((opts.origin??'learner')!=='learner'||typeof author!=='string'||!text.startsWith(author)||opts.after||opts.composing||
     opts.kept||opts.selection?.multiple||opts.selection?.isCollapsed===false||sourceMarker.test(line)||
     (line.match(/"/g)||[]).length%2||(line.match(/`/g)||[]).length%2||
     (line.match(/“/g)||[]).length>(line.match(/”/g)||[]).length ||
     (line.match(/‘/g)||[]).length>(line.match(/’/g)||[]).length ||
     /(^|\s)'[^']*$/u.test(line))return empty();
  if(!/(?:\b(?:take|place|put|choose|pick|select|locate|lies?|belongs?|classify|between|labels?|options?|element|member|subset)\b|[∈∉⊆⊊⊂])/iu.test(clause))return undefined;
  if(/[\p{L}\p{N}]/u.test(text.slice(author.length)))return empty();
  const names=suppliedNames(author);
  if((names.length!==2&&names.length!==3)||(opts.mode==='coin'&&names.length!==2))return empty();
  const chosen=opts.mode==='coin'?[names[coin(seed,names)]]:names;
  return {keys:chosen.map(word=>({word,kind:opts.mode==='coin'?'operand-coin':'operand-menu'})),ghost:null};
}
export function makeAccelerator(assets,config={}) {
  const seed=config.seed??globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  const base=makeSpeedAid(assets,{...config,seed}), dict={...assets.wordAssets,words:assets.words};
  return {...base,predict(text,opts={}){
    const mode=opts.mode??'balanced', surface=opts.surface??'keys';
    if(mode==='fast'||mode==='strict')return base.predict(text,{...opts,mode});
    if(!['balanced','committed','menu','coin'].includes(mode)||typeof text!=='string'||text.length>16000)return empty();
    if(surface==='keys' && (mode==='menu'||mode==='coin')){
      const offered=studentChoices(text,{...opts,mode},seed);
      if(offered)return offered;
    }
    const prediction=base.predict(text,{...opts,surface,mode:'fast'});
    if(surface!=='keys')return prediction;
    const stem=text.match(/[\p{L}\p{M}]+$/u)?.[0]?.toLowerCase()||'';
    const strength=mode==='committed'?'committed':'balanced';
    return {...prediction,keys:prediction.keys.filter(k=>{
      if(k.kind==='transcription')return true;
      if(strength==='balanced' && stem.length>=2 && writingWords.has(k.word.toLowerCase()) && k.word.toLowerCase().startsWith(stem))return true;
      return permitWord(text,k,opts,dict,{strength});
    })};
  }};
}
async function asset(path,text=false) {
  const r=await fetch(new URL(path,import.meta.url));if(!r.ok)throw Error('Failed to load '+path);
  return text?r.text():r.json();
}
export async function createAccelerator() {
  let bundled=globalThis.LEMMA_SPEED_ASSETS;
  if(!bundled){
    const [phrases,veto,policy,words,wordAssets,ranks,speedPolicy]=await Promise.all([asset('./legacy/runtime-phrases.json'),
      asset('./legacy/runtime-veto.json'),asset('./legacy/policy.json'),asset('./wordlist.txt',true),asset('./word-assets.json'),
      asset('./math-ranks.json'),asset('./speed-policy.json')]);
    bundled={phrases,veto,policy,words,wordAssets,ranks,speedPolicy};
  }
  let seed=globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  try{
    const stored=globalThis.sessionStorage?.getItem('lemma-operand-seed');
    if(stored && /^\d{1,10}$/u.test(stored))seed=Number(stored)>>>0;
    else globalThis.sessionStorage?.setItem('lemma-operand-seed',String(seed));
  }catch{} // A private window can disable storage; the editor still uses one session draw.
  return makeAccelerator(bundled,{seed});
}
