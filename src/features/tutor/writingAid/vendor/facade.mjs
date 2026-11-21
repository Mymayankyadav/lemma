import {makeRevision} from './legacy/revision.mjs';
import {candidates} from './words.mjs';
import {phraseCandidates, inlineEdit} from './phrases.mjs';
import {shortcut} from './shortcuts.mjs';

const empty=()=>({keys:[],ghost:null});
const MODE=new Set(['fast','strict','menu','coin']);
const risky=/^(?:not|no|or|if|only|all|some|any|neither|never|contradiction|contrapositive|induction|injective|surjective|bijective|infinite|finite|nonempty|empty|zero|nonzero|positive|negative|unique|uniqueness|compact|compactness|continuous|discontinuous|unbounded|bounded|convergence|divergence|contradicts|witness|true|false|greater|less|every|exists|inverse)$/iu;
const prefixAt=text=>text.match(/[\p{L}\p{M}\p{N}_]+$/u)?.[0]||'';
const outputCount=text=>(text.match(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu)||[]).length;
const protectedGap=text=> /(?:\b(?:take|choose|let)\s+\p{L}[\p{L}\d_]*\s+(?:in|from)|\b(?:by|equals?|witness|implies|therefore|hence|consequently)|[=<>≤≥∈∉⊆⊂≠])\s*$/iu.test(text);
function allowed(text,opts) {
  if(typeof text!=='string'||text.length>16000 || opts.origin!=='learner' || opts.composing || opts.kept || opts.after ||
     opts.selection?.multiple || opts.selection?.isCollapsed===false)return false;
  const line=text.slice(text.lastIndexOf('\n')+1);
  if(/(?:^|\s)(?:tutor|instructor|assistant|solution|code|prompt)\s*:/iu.test(line))return false;
  if((line.match(/\x60/gu)||[]).length%2 || (line.match(/"/gu)||[]).length%2 ||
     (line.match(/“/gu)||[]).length>(line.match(/”/gu)||[]).length)return false;
  return true;
}
function coin(seed, key){
  let value=((seed>>>1)^2166136261)>>>0;
  for(const c of key)value=Math.imul(value^c.charCodeAt(0),16777619)>>>0;
  // A session coin XOR a deterministic offset gives exact 1/2 marginal per choice.
  return ((value>>>8)&1)^(seed&1);
}
export function makeSpeedAid(assets,defaults={}){
  const prior=makeRevision(assets.phrases,assets.veto,assets.policy);
  const dict={...assets.wordAssets,words:assets.words,ranks:assets.ranks||{}};
  const randomSeed=defaults.seed??globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  const config={ranker:'corpus',contextWords:1,minStem:1,domainStem:3,riskStem:4,maxChain:2,...assets.speedPolicy,...defaults};
  function predict(text,options={}){
    const opts={mode:'fast',surface:'keys',origin:'learner',...options};
    if(!MODE.has(opts.mode)||!allowed(text,opts))return empty();
    if(opts.mode==='strict')return prior.predict(text,opts);
    const anchor=opts.authoredText??text;
    if(typeof anchor!=='string'||!text.startsWith(anchor))return empty();
    const partial=prefixAt(text);
    const inherited=prior.predict(text,opts);
    const signed=/\bIn words, /u.test(text);
    if((opts.surface==='keys'?inherited.keys?.length:inherited.ghost) && (signed || opts.pinned)){
      return opts.surface==='keys'?{keys:inherited.keys.map(k=>({...k,kind:'transcription'})),ghost:null}
         : {keys:[],ghost:{...inherited.ghost,kind:'transcription'}};
    }
    if(outputCount(text.slice(anchor.length))>=config.maxChain)return empty();
    if((opts.mode==='menu'||opts.mode==='coin') && opts.surface==='keys' && !partial){
      // An operand menu only draws names from a learner-authored declaration.
      const menu=candidates(text,{...opts,authoredText:anchor,mode:'menu'},dict,config).keys;
      if(menu.length>=2){
        const sorted=menu.slice().sort((a,b)=>a.word.localeCompare(b.word,'en'));
        if(opts.mode==='menu')return {keys:sorted.map(x=>({...x,kind:'operand-menu'})),ghost:null};
        if(sorted.length===2){
          // Re-ordering or restating the premises cannot alter the coin. Keep
          // the draw stable through refresh and across the two counterfactuals.
          const slot=sorted.map(x=>x.word).join('|');
          return {keys:[{...sorted[coin(randomSeed,slot)],kind:'operand-coin'}],ghost:null};
        }
        return empty();
      }
    }
    if(protectedGap(text))return empty();
    if(opts.surface==='ghost'){
      if(inherited.ghost)return {keys:[],ghost:{...inherited.ghost,kind:'vetted-phrase'}};
      if(config.extraPhrases===false)return empty();
      const {ghost}=phraseCandidates(text,{...opts,authoredText:anchor},dict,config);
      if(!ghost||outputCount(ghost.suffix)>config.maxChain-outputCount(text.slice(anchor.length)))return empty();
      return {keys:[],ghost};
    }
    if(opts.surface!=='keys')return empty();
    const raw=candidates(text,{...opts,authoredText:anchor,mode:'fast'},dict,config);
    const inheritedKeys=(inherited.keys||[]).map(x=>({...x,kind:'vetted-word'}));
    const unique=new Map();
    for(const k of [...inheritedKeys,...raw.keys]){
      if(typeof k.word!=='string'||!/^[\p{L}\p{M}\p{N}_]+$/u.test(k.word)||unique.has(k.word))continue;
      if(k.kind==='word' && (partial.length<config.minStem || !k.word.startsWith(partial)))continue;
      if(risky.test(k.word) && k.kind!=='vetted-word' && (partial.length<config.riskStem || partial.length<Math.ceil(k.word.length*.55)))continue;
      if(k.kind==='function' && (!text.trim() || config.boundary===false || ['and','by'].includes(k.word)))continue;
      unique.set(k.word,k);
    }
    return {keys:[...unique.values()].slice(0,config.maxCandidates??3),ghost:null};
  }
  function edit(row,opts={}){
    if(!row||row.origin && row.origin!=='learner')return null;
    const base=prior.edit(row);
    if(base||opts.mode==='strict')return base;
    return inlineEdit({...row,origin:row.origin??'learner'},opts,dict,{localSpelling:true});
  }
  return {predict,edit,shortcut};
}
async function load(name,type='json'){
  const r=await fetch(new URL(name,import.meta.url));
  if(!r.ok)throw Error('Could not load '+name);
  return type==='text'?r.text():r.json();
}
export async function createSpeedAid(){
  if(globalThis.LEMMA_SPEED_ASSETS)return makeSpeedAid(globalThis.LEMMA_SPEED_ASSETS);
  const [phrases,veto,policy,words,wordAssets,ranks,speedPolicy]=await Promise.all([load('./legacy/runtime-phrases.json'),
    load('./legacy/runtime-veto.json'),load('./legacy/policy.json'),load('./wordlist.txt','text'),load('./word-assets.json'),load('./math-ranks.json'),load('./speed-policy.json')]);
  return makeSpeedAid({phrases,veto,policy,words,wordAssets,ranks,speedPolicy});
}
