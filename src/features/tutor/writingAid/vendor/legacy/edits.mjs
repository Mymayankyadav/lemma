// Local, conservative edit suggestions. No proof or semantic inference is made.
const symbols = new Map(Object.entries({
  '<=':'≤', '>=':'≥', '!=':'≠', '->':'→', '<->':'↔', '=>':'⇒', '<=>':'⇔',
  '\\in':'∈', '\\notin':'∉', '\\subseteq':'⊆', '\\supseteq':'⊇',
  '\\cup':'∪', '\\cap':'∩', '\\times':'×', '\\leq':'≤', '\\geq':'≥',
  '\\neq':'≠', '\\forall':'∀', '\\exists':'∃', '\\infty':'∞',
  '\\epsilon':'ε', '\\alpha':'α', '\\beta':'β', '\\lambda':'λ',
  '\\rightarrow':'→', '\\emptyset':'∅',
  eps:'ε', epsilon:'ε', alpha:'α', beta:'β', lambda:'λ', infty:'∞',
  forall:'∀', exists:'∃', leq:'≤', geq:'≥', neq:'≠', subseteq:'⊆',
  supseteq:'⊇', notin:'∉',
  _0:'₀', _1:'₁', _2:'₂', _3:'₃', _4:'₄', _5:'₅', _6:'₆', _7:'₇', _8:'₈', _9:'₉'
}));
const infix = new Map([['in','∈'], ['union','∪'], ['intersection','∩'],
  ['times','×'], ['minus','−'], ['-','−']]);
// Attested full-token misspellings only. Terms likely to encode proof strategy,
// property names or the intended theorem are intentionally excluded.
const strictTypos = new Map(Object.entries({
  teh:'the', recieve:'receive', recieved:'received', seperate:'separate',
  seperately:'separately', becuase:'because', becasue:'because', thier:'their',
  wierd:'weird', definately:'definitely', occured:'occurred', occurence:'occurrence',
  neccessary:'necessary', sufficent:'sufficient', conlcusion:'conclusion',
  arguement:'argument', asssume:'assume', assumtion:'assumption', statment:'statement',
  equivilent:'equivalent', equvalent:'equivalent', exampel:'example', exmaple:'example',
  calculaton:'calculation', arbitary:'arbitrary'
}));
const extendedTypos = new Map(Object.entries({
  continous:'continuous', continutiy:'continuity', differentiabilty:'differentiability',
  deriviative:'derivative', intergral:'integral', intergrate:'integrate',
  funtion:'function', fuction:'function', sequnce:'sequence', subsequnce:'subsequence',
  convergance:'convergence', convergentce:'convergence', convergesnce:'convergence',
  divergance:'divergence', boundednesss:'boundedness', compactnes:'compactness',
  commutitive:'commutative', associativty:'associativity', vectro:'vector',
  matirx:'matrix', matrx:'matrix', elemnt:'element', memebr:'member', subest:'subset',
  equaiton:'equation', ineqaulity:'inequality', inequalty:'inequality', polynomail:'polynomial',
  probabilty:'probability', dimesion:'dimension', dimenson:'dimension'
}));
const harmless = new Set(['the']);
const word = /[\p{L}\p{N}_]/u;
function literal(row) {
  const before = row.before, after = row.after;
  if (row.composing || row.kept === true || row.origin === 'code' || row.origin === 'literal' ||
      row.origin === 'identifier' || row.origin === 'verbatim') return true;
  if (row.selection && typeof row.selection === 'object' &&
      (row.selection.composing || row.selection.multiple || row.selection.isCollapsed === false)) return true;
  // Unclosed delimiters before the span indicate a quoted or code region.
  for (const q of ['`', '"', '“', "'"]) {
    if (q === "'" && /\p{L}'\p{L}/u.test(before)) continue;
    const open = q === '“' ? (before.match(/“/g)||[]).length > (before.match(/”/g)||[]).length
      : ((before.split(q).length - 1) % 2 === 1);
    if (open) return true;
  }
  if (/(?:search(?: for)?|find|identifier|variable name|field|token|literal|verbatim|code|quoted|quotation|glossary|mentions?|discusses?|spells?|type exactly)\b[^.!?\n]{0,100}$/i.test(before)) return true;
  const l = before.at(-1) || '', r = after[0] || '';
  if ((word.test(l) && word.test(row.span[0] || '')) ||
      (word.test(r) && word.test(row.span.at(-1) || ''))) {
    // A subscript intentionally attaches to a mathematical variable.
    if (!/^_[0-9]$/.test(row.span) || word.test(r)) return true;
  }
  return false;
}
function mathDelimited(before, after, row) {
  if (row.mathMode === true) return true;
  const dollar = (before.match(/(?<!\\)\$/g)||[]).length % 2 === 1 && /(?<!\\)\$/.test(after);
  return dollar || (before.lastIndexOf('\\(') > before.lastIndexOf('\\)') && after.includes('\\)')) ||
    (before.lastIndexOf('\\[') > before.lastIndexOf('\\]') && after.includes('\\]'));
}
function infixEligible(before, after, raw) {
  // A single complete atom, never a sentence fragment, on each side.
  const atom = '(?:[A-Za-z](?:_[0-9]+)?|[0-9]+(?:\\.[0-9]+)?|[A-Za-z]\\([A-Za-z0-9]+\\))';
  const l = before.match(new RegExp('(?:^|[\\s(=])(' + atom + ')\\s+$'));
  const r = after.match(new RegExp('^\\s+(' + atom + ')(?=$|[\\s.,;:!?)}])'));
  if (!l || !r) return false;
  if (raw === 'in') return /^[A-Za-z](?:_[0-9]+)?$/.test(l[1]) && /^[A-Z]$/.test(r[1]);
  if (raw === 'union' || raw === 'intersection') return /^[A-Z]$/.test(l[1]) && /^[A-Z]$/.test(r[1]);
  return /^[a-z0-9]/.test(l[1]) && /^[a-z0-9]/.test(r[1]);
}
function candidate(row, options) {
  if (!row || typeof row !== 'object' || !['blue','red'].includes(row.surface) ||
      typeof row.before !== 'string' || typeof row.span !== 'string' ||
      typeof row.after !== 'string' || !row.span || literal(row)) return null;
  const match = row.span.match(/^(\s*)(\S(?:[\s\S]*?\S)?)(\s*)$/u);
  if (!match) return null;
  const [, lead, token, tail] = match;
  const before = row.before + lead, after = tail + row.after;
  let replacement, rule;
  if (row.surface === 'blue') {
    const mode = options.blueMode ?? 'anchored';
    if (!['explicit','anchored','review'].includes(mode)) return null;
    if (symbols.has(token)) {
      // Aliases must stand alone; subscripts require a preceding variable.
      if (/^_[0-9]$/.test(token) && !/[A-Za-z0-9]$/.test(before)) return null;
      replacement = symbols.get(token); rule = 'explicit-notation';
    } else if (infix.has(token) && mode !== 'explicit' && infixEligible(before, after, token)) {
      const delimited = mathDelimited(before, after, row);
      // Outside delimiters, require an additional unmistakable notation symbol in the expression.
      const strong = /[=∈∉≤≥≠∪∩×±∞]|\\(?:in|leq|geq)\b/.test((before.split(/[.!?;\n]/u).at(-1) || '').slice(-45) + (after.split(/[.!?;\n]/u)[0] || '').slice(0,45));
      if (mode === 'anchored' && !delimited && !strong) return null;
      replacement = infix.get(token); rule = delimited ? 'math-infix' : 'review-infix';
    } else return null;
  } else {
    const mode = options.redMode ?? 'strict';
    if (!['strict','extended'].includes(mode)) return null;
    if (/[^\x20-\x7e]/.test(token)) return null;
    const doubled = token.match(/^([a-z]+) ([a-z]+)$/);
    if (doubled && doubled[1] === doubled[2] && harmless.has(doubled[1])) {
      replacement = doubled[1]; rule = 'repeated-function-word';
    } else if (strictTypos.has(token)) {
      replacement = strictTypos.get(token); rule = 'attested-typo';
    } else if (mode === 'extended' && extendedTypos.has(token)) {
      replacement = extendedTypos.get(token); rule = 'attested-math-typo';
    } else return null;
  }
  const proposal = lead + replacement + tail;
  if (proposal === row.span) return null;
  return {surface: row.surface, source: row.span, proposal, certificate: {rule}};
}
export function proposeEdit(row, options = {}) { return candidate(row, options); }
export function editCertificate(row, proposal, options = {}) {
  const fresh = candidate(row, options);
  if (!fresh) return false;
  const value = typeof proposal === 'string' ? proposal : proposal?.proposal;
  if (value !== fresh.proposal) return false;
  return typeof proposal === 'string' || (proposal.surface === fresh.surface && proposal.source === fresh.source &&
    proposal.certificate?.rule === fresh.certificate.rule);
}
