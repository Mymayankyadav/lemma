/* Local learner-writing aids. No theorem, proof-method or operand prediction.
 * The caller supplies only learner-authored text as `authoredText`; its exact
 * prefix must match the editable text. Model-generated output is not a source.
 */
const shorthand = new Map([
  ['wlog','without loss of generality'], ['iff','if and only if'],
  ['wrt','with respect to'], ['eps','ε'], ['leq','≤'], ['geq','≥'],
  ['neq','≠'], ['notin','∉'], ['subseteq','⊆']
]);
const spelling = new Map([
  ['supp','suppose'], ['assum','assume'], ['conside','consider'],
  ['therfor','therefore'], ['becaus','because'], ['definitio','definition']
]);
// Only punctuation or closed-class connective material may follow an echoed
// prefix. No mathematical symbols, quantities, variables, or content nouns.
const safeNext = /^(?:\s+(?:the|a|an|of|to|is|are|be|and|or|that|for|with|as|in|by|then|we|it|this|these|such|there|exists|every|if|only|where|from|on|at|given|let|suppose|consider|have|has|was|were|can|will|may|not)\b|[,;:.!?])/iu;
const stopWords = new Set(['not','or','every','exists','if','only','then','let','suppose','consider']);
const letters=/[\p{L}\p{N}_]/u;
function permitted(text, options) {
  return typeof text==='string' && options.origin==='learner' && !options.composing &&
    !options.kept && !options.selection?.multiple && options.selection?.isCollapsed!==false &&
    (options.after===undefined || options.after==='') && text.length<=16000;
}
function literal(text) {
  const last=text.slice(text.lastIndexOf('\n')+1);
  if ((last.match(/`/g)||[]).length%2 || (last.match(/"/g)||[]).length%2 ||
      (last.match(/“/g)||[]).length>(last.match(/”/g)||[]).length) return true;
  return /(?:search|identifier|code|literal|verbatim|product|brand|named|called)\b[^.!?\n]*$/i.test(last);
}
function matchCase(source, value) {
  if(source===source.toLowerCase()) return value;
  if(source[0]===source[0].toUpperCase() && source.slice(1)===source.slice(1).toLowerCase())
    return value[0].toUpperCase()+value.slice(1);
  return null;
}
function count(text, needle) {
  let n=0, pos=0;
  while ((pos=text.indexOf(needle,pos))!==-1) { n++;pos+=Math.max(1,needle.length);if(n>1)break; }
  return n;
}
function maxNeutral(rest) {
  let result='';
  while(rest){const m=rest.match(safeNext);if(!m)break;
    const token=m[0].trim().toLowerCase();
    // Polarity and quantifier choices are never copied into a new gap.
    if(stopWords.has(token)) break;
    result+=m[0];rest=rest.slice(m[0].length);
    if(result.length>=32 || /[.!?]$/.test(result))break;
  }
  // Keep a whole boundary and never offer whitespace alone.
  return /[\p{L}.,;:!?]/u.test(result)?result:'';
}
/** A candidate is a continuation only; it never overwrites typed text. */
export function phraseCandidates(text, options={}, assets={}, config={}) {
  if(!permitted(text,options)||literal(text))return {ghost:null};
  // Strongly typed, fixed spellings. No guessed branch follows the word.
  const word=text.match(/[\p{L}]+$/u)?.[0];
  if(word){const lower=word.toLowerCase(), target=spelling.get(lower);
    if(target && word.length>=4){const styled=matchCase(word,target);if(styled?.startsWith(word) && styled.length>word.length)
      return {ghost:{suffix:styled.slice(word.length)+' ',kind:'typed-spelling'}};}}
  // An explicit learner-selected variable remains verbatim; only neutral
  // framing is offered, ending before a property or choice.
  const frame=text.match(/(?:^|[.!?]\s+|\n)(Let\s+[A-Za-zα-ωΑ-Ω](?:_\d+)?)(\s*(?:b(?:e)?)?)$/u);
  if(frame){const ending=frame[2];const full=' be ';
    if(full.startsWith(ending)&&ending!==full)return {ghost:{suffix:full.slice(ending.length),kind:'literal-scaffold'}};}
  if(config.mode==='grammar-only')return {ghost:null};
  // Learner-authored source is required and must ground the current text.
  // Accepted/generated suffixes are excluded from the source, even if visible.
  const authored=options.authoredText;
  if(typeof authored!=='string'||!text.startsWith(authored)||authored.length>text.length)return {ghost:null};
  // Current fragment must itself be entirely learner-authored, exactly match a
  // contiguous earlier occurrence, and have a unique earlier source.
  const start=Math.max(text.lastIndexOf('\n')+1,text.lastIndexOf('. ')+2);
  const fragment=text.slice(start);
  if(start>authored.length || text.length>authored.length || fragment.length<8 ||
     !/\s/.test(fragment) || fragment.trim()!==fragment || literal(fragment))return {ghost:null};
  const prior=authored.slice(0,start);
  if(count(prior,fragment)!==1)return {ghost:null};
  const i=prior.indexOf(fragment), rest=prior.slice(i+fragment.length);
  // Require word boundaries so a coincidental substring is not an n-gram.
  if((i && letters.test(prior[i-1])) || (letters.test(fragment.at(-1)) && letters.test(rest[0]||'')))return {ghost:null};
  const suffix=maxNeutral(rest);
  return {ghost:suffix?{suffix,kind:'learner-echo'}:null};
}
/** Exact, full-token, explicitly typed shorthand or attested local spelling. */
export function inlineEdit(row, options={}, assets={}, config={}) {
  if(!row||row.origin!=='learner'||row.composing||row.kept||typeof row.before!=='string'||
     typeof row.span!=='string'||typeof row.after!=='string'||literal(row.before)||
     letters.test(row.before.at(-1)||'')||letters.test(row.after[0]||''))return null;
  const src=row.span;
  if(row.surface==='blue' && shorthand.has(src)){
    // Symbol abbreviations need explicit math mode; prose acronyms require a
    // learner-requested shorthand mode. Ordinary words are never rewritten.
    if(['eps','leq','geq','neq','notin','subseteq'].includes(src)?row.mathMode!==true:row.shorthandMode!==true)return null;
    return {surface:'blue',source:src,proposal:shorthand.get(src),kind:'typed-shorthand'};
  }
  // Optional variant: a single insertion/deletion/substitution typo in a word
  // previously written in this same paragraph. Only fixed attested pairs are
  // eligible, never valid words, variables, formulae or claimed properties.
  if(row.surface==='red' && config.localSpelling===true && typeof row.authoredText==='string'){
    const pairs=new Map([['queston','question'],['sentnce','sentence'],['wordng','wording'],['notaton','notation'],['explanaton','explanation']]);
    const proposal=pairs.get(src);if(!proposal)return null;
    const para=row.before.slice(row.before.lastIndexOf('\n')+1);
    if(row.authoredText.startsWith(row.before+row.span) && new RegExp('(?:^|[^\\p{L}])'+proposal+'(?:$|[^\\p{L}])','u').test(para))
      return {surface:'red',source:src,proposal,kind:'attested-local-spelling'};
  }
  return null;
}
