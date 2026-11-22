/**
 * Synchronous proof-writing candidate engine. Assets: {words: string|string[],
 * common: string[], next: Record<string,string[]>, boundary: string[]}.
 * Load wordlist.txt once as UTF-8 and spread word-assets.json into assets.
 * text and authoredText are learner-origin only. Menu names are taken ONLY
 * from explicit authoredText; models, tutor text, and mathematical truth are
 * never consulted. `mode:'menu'` is deterministic and distinct from words.
 */
import {createCorpusContextScorer} from './corpus-context.mjs';

const INDEX = new WeakMap();
const TOKEN = /[\p{L}\p{M}]+$/u;
function indexFor(assets) {
  let index = INDEX.get(assets); if (index) return index;
  const words = Array.isArray(assets.words) ? assets.words : String(assets.words || '').split(/\r?\n/);
  const common = (assets.common || []).map(w => w.toLocaleLowerCase());
  const rank = new Map(common.map((w,i)=>[w,i]));
  const ordered = words.every((word, i) => i === 0 || words[i - 1] <= word);
  // One typed letter is eligible only for the first 61 common words or a word
  // supplied by the learner. Learner words still enter via the authored draft.
  const shortList = common.slice(0, 61);
  const oneLetter = shortList.every(word => /^[a-z]+$/u.test(word)) ? shortList : null;
  index = {words, common, rank, ordered, oneLetter}; INDEX.set(assets,index); return index;
}

function lowerBound(words, key) {
  let start = 0, end = words.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (words[middle] < key) start = middle + 1;
    else end = middle;
  }
  return start;
}

function groupFor(index, key) {
  const group=new Set();
  const start = index.ordered ? lowerBound(index.words, key) : 0;
  for (let i = start; i < index.words.length; i++) {
    const word = index.words[i];
    if (word.startsWith(key)) group.add(word);
    else if (index.ordered) break;
  }
  for (const word of index.common) if (word.startsWith(key)) group.add(word);
  return group;
}
function caseLike(word, prefix) {
  if ([...prefix].length > 1 && prefix === prefix.toLocaleUpperCase() && prefix !== prefix.toLocaleLowerCase()) return word.toLocaleUpperCase();
  if (/^\p{Lu}/u.test(prefix)) return word[0].toLocaleUpperCase()+word.slice(1);
  return word;
}
function recentPenalty(word,recent) {
  if (Array.isArray(recent)) return recent.filter(w => String(w).toLocaleLowerCase() === word).length * 12;
  return recent && typeof recent === 'object' ? Math.min(10, Number(recent[word] || 0))*12 : 0;
}
// Methods, polarity and semantic properties can carry a proof idea. They may
// appear only after a strong typed prefix; candidates retain an explicit tag.
const LOGIC = new Set(('not no never none all some every exists true false if unless only necessary sufficient implies equivalent contradiction induction contrapositive injective surjective bijective positive negative nonnegative nonpositive bounded unbounded convergent divergent continuous discontinuous finite infinite open closed equal unequal').split(' '));
function menuNames(text, authoredText) {
  if (!/(?:\b(?:take|choose|let)\s+\p{L}[\p{L}\p{N}_]*\s+(?:in|from)|\b(?:belongs to|lies in|is an element of|is a subset of)|[∈∉⊆⊂])\s*$/iu.test(text) || typeof authoredText !== 'string') return [];
  // Remove quoted/code material and tutor/system lines or attributed sentences.
  const clean=authoredText.replace(/```[\s\S]*?```|`[^`]*`|"[^"\n]*"|“[^”]*”/gu,' ')
    .split(/(?<=[.!?])\s+|\n+/u).filter(s=>!/^(?:tutor|teacher|system|assistant|question|prompt)\s*:/iu.test(s.trim()) && !/\b(?:tutor|teacher|assistant|system)\s+(?:said|wrote|suggested|asks?|gave)\b/iu.test(s)).join(' ');
  const names=new Set(), add=s=>{if(s!=='I') names.add(s);};
  // Declarations and explicit definitions are learner intent, not sentence
  // initial articles or mere incidental mentions.
  const decl=/\b(?:[Ll]et|[Tt]ake|[Cc]hoose|[Dd]efine|[Gg]iven|[Ss]ets?)\s+([A-Z](?:_[0-9]+)?(?:\s*(?:,|and|or)\s*[A-Z](?:_[0-9]+)?)*)\s+(?:be|are|is|denote|represent|become|=|∈)/gu;
  for(const m of clean.matchAll(decl)) for(const n of m[1].match(/[A-Z](?:_[0-9]+)?/gu)||[]) add(n);
  const namedSets=/\b([A-Z](?:_[0-9]+)?(?:\s*(?:,|and|or)\s*[A-Z](?:_[0-9]+)?)+)\s+(?:are|denote)\s+(?:sets?|subsets?|groups?|spaces?)\b/gu;
  for(const m of clean.matchAll(namedSets)) for(const n of m[1].match(/[A-Z](?:_[0-9]+)?/gu)||[]) add(n);
  for(const m of clean.matchAll(/(?<![\p{L}\p{N}_])([A-Z](?:_[0-9]+)?)\s*[:=]\s*(?:\{|\[|\()/gu)) add(m[1]);
  const sorted=[...names].sort((a,b)=>a<b?-1:a>b?1:0);
  return sorted.length>=2 && sorted.length<=3 ? sorted : [];
}
export function candidates(text, options = {}, assets = {}, config = {}) {
  const {authoredText, mode='fast', recent=[]} = options;
  const ranker=config.ranker ?? 'manual';
  if (typeof text !== 'string' || !['fast','strict','menu'].includes(mode)) return {keys:[], lane:'none'};
  if (mode === 'menu') {
    const names = menuNames(text,authoredText);
    return {keys:names.map(word=>({word,kind:'operand'})), lane:names.length?'learner-menu':'none'};
  }
  const before = text.slice(0, options.caret ?? text.length);
  const match=before.match(TOKEN), prefix=match?.[0] || '';
  const left=prefix ? before.slice(0,-prefix.length) : before;
  if (/[`"“”]/u.test(before) && ((before.match(/[`"“”]/gu)||[]).length%2)) return {keys:[],lane:'none'};
  if (!prefix) {
    // A gap at a mathematical relation or unresolved choice is not a word slot.
    if (/(?:\b(?:in|from|equals?|choose|take|witness|implies|is)\s*|[=<>∈∉⊆⊂≤≥≠])\s*$/iu.test(before)) return {keys:[],lane:'none'};
    const prev=(before.toLocaleLowerCase().match(/[\p{L}\p{M}]+(?=\s*$)/u)||[])[0] || '';
    const allowed = new Set(assets.boundary || []);
    const items = [...(assets.next?.[prev] || []), ...(assets.boundary || [])].filter((w,i,a)=>allowed.has(w)&&a.indexOf(w)===i);
    return {keys:items.slice(0,3).map(word=>({word,kind:'function'})),lane:'boundary'};
  }
  const lower=prefix.toLocaleLowerCase(), plen=[...lower].length;
  if (plen < (mode==='strict'?3:(config.minStem??2))) return {keys:[],lane:'none'};
  const index=indexFor(assets), {rank}=index;
  const pool=plen===1 && /^[a-z]$/u.test(lower) && index.oneLetter
    ? index.oneLetter : groupFor(index,lower);
  const scores=new Map(), previous=(left.toLocaleLowerCase().match(/[\p{L}\p{M}]+(?=\s*$)/u)||[])[0] || '';
  const next=assets.next?.[previous] || [];
  const contextScore=createCorpusContextScorer(left,assets.ranks,config);
  for (const word of pool) {
    if (!word.startsWith(lower) || word===lower) continue;
    if (LOGIC.has(word) && plen < Math.min(5,word.length)) continue;
    const commonRank=rank.get(word);
    // Rare dictionary entries need a stronger typed stem, reducing noisy menus.
    const count=assets.ranks?.unigram?.[word] || 0;
    if (plen===1 && (commonRank===undefined || commonRank>60)) continue;
    if (commonRank===undefined && plen < (mode==='strict'?5:(count>=18 ? (config.domainStem??3) : 4))) continue;
    let score=commonRank===undefined ? 15-Math.min(word.length,20) : 160-commonRank;
    if (ranker === 'corpus' && assets.ranks) {
      const ranks=assets.ranks;
      score = Math.log1p(ranks.unigram?.[word] || 0)*14;
      score = contextScore(word,score);
    } else { const p=next.indexOf(word); if(p>=0) score+=70-p*8; }
    scores.set(word,score-recentPenalty(word,recent));
  }
  // Earlier learner-authored words provide domain vocabulary and accents.
  const own = typeof authoredText==='string' ? authoredText : left;
  for(const m of own.matchAll(/[\p{L}\p{M}]{3,}/gu)) {
    const w=m[0].toLocaleLowerCase(); if(LOGIC.has(w) && plen < Math.min(5,w.length)) continue; if(w.startsWith(lower) && w!==lower) scores.set(w, Math.max(scores.get(w)??-Infinity, 210-recentPenalty(w,recent)));
  }
  const limit=Math.max(1,Math.min(config.researchPool?6:3,config.maxCandidates ?? 3));
  const keys=[...scores].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,limit).map(([w])=>({word:caseLike(w,prefix),kind:'word',...(LOGIC.has(w)?{risk:'logic'}:{})}));
  return {keys, lane:keys.length?'lexical':'none'};
}
