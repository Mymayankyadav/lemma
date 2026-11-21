export const TUTOR_SYMBOL_CATALOG_VERSION = 'lemma-tutor-symbols-v1';
export const SYMBOL_CATEGORIES = ['Logic', 'Sets', 'Relations', 'Maps', 'Analysis', 'Number sets', 'Greek'] as const;
export type SymbolCategory = (typeof SYMBOL_CATEGORIES)[number];

export interface SymbolDefinition {
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly tex: string;
  readonly aliases: readonly string[];
  readonly category: SymbolCategory;
  readonly recognizerIds: readonly string[];
  readonly extensionFamilyIds: readonly string[];
}

type SymbolEntry = readonly [
  id: string, glyph: string, tex: string, name: string, aliases: readonly string[],
  recognizerIds: readonly string[], extensionFamilyIds?: readonly string[],
];

// Recognizer IDs are exact Typst labels from Detypify service 0.3.0. An empty
// list denotes a hand-picked symbol with no class for its exact glyph.
const entries: Readonly<Record<SymbolCategory, readonly SymbolEntry[]>> = {
  Logic: [
    ['forall', '∀', '\\forall', 'For all', ['for every', 'for each', 'forall', 'universal quantifier', 'upside down A', 'inverted A', 'turned A'], ['forall']],
    ['exists', '∃', '\\exists', 'There exists', ['there exist', 'exists', 'existential quantifier', 'backwards E', 'backward E', 'reversed E', 'flipped E', 'mirror E'], ['exists']],
    ['not-exists', '∄', '\\nexists', 'There does not exist', ['does not exist', 'nexists', 'crossed out backwards E', 'backwards E with a slash'], ['exists.not']],
    ['not', '¬', '\\neg', 'Negation', ['logical not', 'lnot'], ['not']],
    ['and', '∧', '\\land', 'Logical and', ['conjunction', 'wedge'], ['and']],
    ['or', '∨', '\\lor', 'Logical or', ['disjunction', 'vee'], ['or']],
    ['implies', '⇒', '\\Rightarrow', 'Implies', ['implication', 'implies that', '\\implies'], ['arrow.r.double']],
    ['implied-by', '⇐', '\\Leftarrow', 'Implied by', ['\\impliedby'], ['arrow.l.double']],
    ['iff', '⇔', '\\Leftrightarrow', 'If and only if', ['iff', 'biconditional', '\\iff'], ['arrow.l.r.double']],
    ['therefore', '∴', '\\therefore', 'Therefore', ['thus'], ['therefore']],
    ['because', '∵', '\\because', 'Because', ['since'], ['because']],
    ['qed', '∎', '\\blacksquare', 'End of proof', ['qed', 'tombstone'], ['qed']],
    ['top', '⊤', '\\top', 'Top', ['truth'], ['tack.b', 'top']],
    ['bottom', '⊥', '\\bot', 'Bottom', ['falsehood'], ['bot', 'tack.t']],
    ['proves', '⊢', '\\vdash', 'Proves', ['turnstile', 'syntactic entailment'], ['tack.r']],
    ['entails', '⊨', '\\vDash', 'Entails', ['double turnstile', 'semantic entailment'], ['tack.r.double']],
  ],
  Sets: [
    ['element-of', '∈', '\\in', 'Element of', ['is an element of', 'is in', 'belongs to', 'member of', 'member', 'curvy E', 'curved E', 'rounded E', 'curvy lowercase E'], ['in'], ['not-element-of']],
    ['not-element-of', '∉', '\\notin', 'Not an element of', ['not an element of', 'not element of', 'not in', 'not a member of', 'crossed out member', 'curvy E with a slash'], ['in.not'], ['not-element-of']],
    ['contains-element', '∋', '\\ni', 'Contains as an element', ['contains', 'has member', 'backwards curvy E', 'reversed curved E', '\\owns'], ['in.rev']],
    ['subset', '⊂', '\\subset', 'Subset', ['subset of', 'is a subset of', 'contained in'], ['subset'], ['subset-or-equal']],
    ['subset-or-equal', '⊆', '\\subseteq', 'Subset or equal', ['subset', 'subset of', 'is a subset of', 'contained in', 'subseteq', 'sideways U with a line', 'sideways cup with a line'], ['subset.eq'], ['subset-or-equal', 'not-subset-or-equal']],
    ['proper-subset', '⊊', '\\subsetneq', 'Proper subset', ['proper subset of', 'strict subset', 'strict inclusion'], ['subset.neq']],
    ['not-subset', '⊄', '\\not\\subset', 'Not a subset', ['\\nsubset'], []],
    ['not-subset-or-equal', '⊈', '\\nsubseteq', 'Not a subset or equal', ['\\nsubseteq'], ['subset.eq.not'], ['not-subset-or-equal']],
    ['superset', '⊃', '\\supset', 'Superset', ['superset of', 'contains'], ['supset'], ['superset-or-equal']],
    ['superset-or-equal', '⊇', '\\supseteq', 'Superset or equal', ['superset', 'superset of', 'contains', 'supseteq'], ['supset.eq'], ['superset-or-equal', 'not-superset-or-equal']],
    ['proper-superset', '⊋', '\\supsetneq', 'Proper superset', ['strict superset', 'proper superset of'], ['supset.neq']],
    ['not-superset-or-equal', '⊉', '\\nsupseteq', 'Not a superset or equal', [], ['supset.eq.not'], ['not-superset-or-equal']],
    ['union', '∪', '\\cup', 'Union', ['cup', 'U shape'], ['union']],
    ['intersection', '∩', '\\cap', 'Intersection', ['intersect', 'cap', 'upside down U', 'inverted U'], ['inter']],
    ['big-union', '⋃', '\\bigcup', 'Indexed union', ['big union'], ['union.big']],
    ['big-intersection', '⋂', '\\bigcap', 'Indexed intersection', ['big intersection'], ['inter.big']],
    ['disjoint-union', '⊔', '\\sqcup', 'Disjoint union', ['square union', 'coproduct'], ['union.sq']],
    ['set-minus', '∖', '\\setminus', 'Set minus', ['set difference', 'setminus'], ['without']],
    ['empty-set', '∅', '\\varnothing', 'Empty set', ['emptyset', 'null set', 'slashed circle', 'crossed out circle', 'circle with diagonal line', '\\emptyset'], ['emptyset', 'nothing']],
    ['complement', 'ᶜ', '^{\\mathrm{c}}', 'Complement exponent', ['superscript c'], []],
    ['power-set', '𝒫', '\\mathcal{P}', 'Power set', ['script P', 'powerset'], []],
  ],
  Relations: [
    ['equal', '=', '=', 'Equal', ['equals', 'equal to', 'is equal to'], [], ['not-equal']],
    ['not-equal', '≠', '\\neq', 'Not equal', ['not equal to', 'is not equal to', 'neq', '\\ne'], [], ['not-equal']],
    ['less-than', '<', '<', 'Less than', ['strictly less than', 'lt', '\\lt'], [], ['less-than-or-equal']],
    ['less-than-or-equal', '≤', '\\leq', 'Less than or equal to', ['less than or equal', 'at most', 'leq', 'less than with a line', 'left angle with a line', '\\le'], ['lt.eq'], ['less-than-or-equal']],
    ['greater-than', '>', '>', 'Greater than', ['strictly greater than', 'gt', '\\gt'], [], ['greater-than-or-equal']],
    ['greater-than-or-equal', '≥', '\\geq', 'Greater than or equal to', ['greater than or equal', 'at least', 'geq', 'greater than with a line', 'right angle with a line', '\\ge'], ['gt.eq'], ['greater-than-or-equal']],
    ['identical', '≡', '\\equiv', 'Identical', ['triple equals', 'equivalence sign'], ['eq.triple', 'equiv']],
    ['congruent', '≅', '\\cong', 'Tilde over equals', ['congruence sign', 'congruent to', 'isomorphism sign', 'isomorphic to'], ['tilde.equiv']],
    ['similar-or-equal', '≃', '\\simeq', 'Tilde over bar', ['similar or equal', 'equivalence sign'], ['tilde.eq']],
    ['similar', '∼', '\\sim', 'Tilde operator', ['similar', 'relation sign', 'squiggle', 'wavy line'], ['tilde.op']],
    ['tilde', '~', '\\text{\\textasciitilde}', 'Tilde', ['basic tilde', 'squiggle', 'wavy line'], ['tilde.basic']],
    ['approximately-equal', '≈', '\\approx', 'Approximately equal', ['approximately', 'approx', 'double squiggle', 'two wavy lines'], ['approx']],
    ['proportional', '∝', '\\propto', 'Proportional to', [], ['prop']],
    ['divides', '∣', '\\mid', 'Divides', ['divisibility', 'mid'], ['divides']],
    ['not-divides', '∤', '\\nmid', 'Does not divide', ['not divides'], ['divides.not']],
    ['parallel', '∥', '\\parallel', 'Parallel', ['parallel to'], ['parallel']],
    ['perpendicular', '⟂', '\\perp', 'Perpendicular', ['orthogonal', 'perpendicular to'], ['perp']],
  ],
  Maps: [
    ['right-arrow', '→', '\\to', 'Right arrow', ['rightarrow', 'tends to', '\\rightarrow'], ['arrow.r']],
    ['left-arrow', '←', '\\leftarrow', 'Left arrow', ['\\gets'], ['arrow.l']],
    ['two-way-arrow', '↔', '\\leftrightarrow', 'Left-right arrow', ['two-way arrow'], ['arrow.l.r']],
    ['maps-to', '↦', '\\mapsto', 'Maps to', ['mapsto'], ['arrow.r.bar', 'mapsto']],
    ['hook-arrow', '↪', '\\hookrightarrow', 'Hook right arrow', ['inclusion arrow', 'injection arrow'], ['arrow.r.hook']],
    ['two-head-arrow', '↠', '\\twoheadrightarrow', 'Two-headed right arrow', ['surjection arrow'], ['arrow.r.twohead']],
    ['composition', '∘', '\\circ', 'Composition', ['composed with', 'compose', 'circ'], ['circle.stroked.tiny', 'compose']],
    ['direct-sum', '⊕', '\\oplus', 'Circled plus', ['direct sum', 'exclusive or'], ['plus.o', 'xor']],
    ['tensor-product', '⊗', '\\otimes', 'Circled times', ['tensor product'], ['times.o']],
    ['left-angle', '⟨', '\\langle', 'Left angle bracket', ['opening angle bracket'], ['chevron.l']],
    ['right-angle', '⟩', '\\rangle', 'Right angle bracket', ['closing angle bracket'], ['chevron.r']],
  ],
  Analysis: [
    ['plus', '+', '+', 'Plus', ['addition'], []],
    ['minus', '−', '-', 'Minus', ['subtraction'], []],
    ['plus-minus', '±', '\\pm', 'Plus or minus', ['plus minus'], ['plus.minus']],
    ['minus-plus', '∓', '\\mp', 'Minus or plus', ['minus plus'], ['minus.plus']],
    ['times', '×', '\\times', 'Times', ['multiplication', 'cross product', 'Cartesian product'], ['times']],
    ['division', '÷', '\\div', 'Division', ['divide', 'division sign'], ['div']],
    ['middle-dot', '·', '\\text{·}', 'Middle dot', ['center dot'], ['dot.c']],
    ['multiplication-dot', '⋅', '\\cdot', 'Multiplication dot', ['dot product', 'dot operator'], ['dot.op']],
    ['asterisk-operator', '∗', '\\ast', 'Asterisk operator', ['convolution'], ['ast.op', 'convolve']],
    ['infinity', '∞', '\\infty', 'Infinity', ['infty', 'sideways 8', 'sideways eight', 'horizontal figure eight', 'sideways figure eight', 'figure 8 on its side', 'looped squiggle', 'squiggle'], ['infinity', 'oo']],
    ['partial', '∂', '\\partial', 'Partial derivative', ['partial', 'curly d', 'curved d'], ['partial']],
    ['nabla', '∇', '\\nabla', 'Nabla', ['gradient', 'del', 'upside down triangle', 'inverted triangle'], ['gradient', 'nabla']],
    ['integral', '∫', '\\int', 'Integral', ['int'], ['integral']],
    ['double-integral', '∬', '\\iint', 'Double integral', [], ['integral.double']],
    ['triple-integral', '∭', '\\iiint', 'Triple integral', [], ['integral.triple']],
    ['contour-integral', '∮', '\\oint', 'Contour integral', ['closed integral'], ['integral.cont']],
    ['summation', '∑', '\\sum', 'Summation', ['sum', 'sigma sum'], ['sum']],
    ['product', '∏', '\\prod', 'Product operator', ['product', 'prod'], ['product']],
    ['square-root', '√', '\\surd', 'Square root', ['radical', 'sqrt'], []],
    ['norm-bar', '‖', '\\Vert', 'Double vertical bar', ['norm bar'], ['bar.v.double']],
    ['degree', '°', '\\degree', 'Degree', ['degrees'], ['degree']],
    ['prime', '′', '\\prime', 'Prime', ['derivative prime'], ['prime']],
    ['angle', '∠', '\\angle', 'Angle', [], ['angle']],
    ['left-floor', '⌊', '\\lfloor', 'Left floor bracket', ['floor'], ['floor.l']],
    ['right-floor', '⌋', '\\rfloor', 'Right floor bracket', ['floor'], ['floor.r']],
    ['left-ceiling', '⌈', '\\lceil', 'Left ceiling bracket', ['ceil', 'ceiling'], ['ceil.l']],
    ['right-ceiling', '⌉', '\\rceil', 'Right ceiling bracket', ['ceil', 'ceiling'], ['ceil.r']],
    ['ellipsis', '…', '\\ldots', 'Ellipsis', ['dots', 'horizontal ellipsis'], ['dots.h']],
    ['superscript-two', '²', '^2', 'Superscript two', ['squared'], []],
    ['superscript-three', '³', '^3', 'Superscript three', ['cubed'], []],
    ['superscript-n', 'ⁿ', '^n', 'Superscript n', [], []],
  ],
  'Number sets': [
    ['naturals', 'ℕ', '\\mathbb{N}', 'Natural numbers', ['naturals', 'blackboard N'], ['NN']],
    ['integers', 'ℤ', '\\mathbb{Z}', 'Integers', ['integer numbers', 'blackboard Z'], ['ZZ']],
    ['rationals', 'ℚ', '\\mathbb{Q}', 'Rational numbers', ['rationals', 'blackboard Q'], ['QQ']],
    ['reals', 'ℝ', '\\mathbb{R}', 'Real numbers', ['reals', 'blackboard R'], ['RR']],
    ['complexes', 'ℂ', '\\mathbb{C}', 'Complex numbers', ['complexes', 'blackboard C'], ['CC']],
    ['quaternions', 'ℍ', '\\mathbb{H}', 'Quaternions', ['blackboard H'], ['HH']],
    ['probability', 'ℙ', '\\mathbb{P}', 'Blackboard P', ['probability', 'projective space'], ['PP']],
    ['expectation', '𝔼', '\\mathbb{E}', 'Blackboard E', ['expectation', 'expected value'], ['EE']],
    ['script-t', '𝒯', '\\mathcal{T}', 'Script T', ['calligraphic T'], []],
    ['script-u', '𝒰', '\\mathcal{U}', 'Script U', ['calligraphic U'], []],
    ['script-b', 'ℬ', '\\mathcal{B}', 'Script B', ['calligraphic B'], []],
    ['aleph', 'א', '\\aleph', 'Aleph', ['aleph number'], ['aleph']],
    ['script-ell', 'ℓ', '\\ell', 'Script ell', ['ell'], ['ell']],
    ['real-part', 'ℜ', '\\Re', 'Real part', ['Re'], ['Re']],
    ['imaginary-part', 'ℑ', '\\Im', 'Imaginary part', ['Im'], ['Im']],
  ],
  Greek: [
    ['alpha', 'α', '\\alpha', 'Alpha', [], ['alpha']],
    ['beta', 'β', '\\beta', 'Beta', [], ['beta']],
    ['gamma', 'γ', '\\gamma', 'Gamma', [], ['gamma']],
    ['delta', 'δ', '\\delta', 'Delta', [], ['delta']],
    ['epsilon', 'ε', '\\varepsilon', 'Epsilon', ['eps', 'varepsilon'], ['epsilon']],
    ['zeta', 'ζ', '\\zeta', 'Zeta', [], ['zeta']],
    ['eta', 'η', '\\eta', 'Eta', [], ['eta']],
    ['theta', 'θ', '\\theta', 'Theta', [], ['theta']],
    ['iota', 'ι', '\\iota', 'Iota', [], ['iota']],
    ['kappa', 'κ', '\\kappa', 'Kappa', [], ['kappa']],
    ['lambda', 'λ', '\\lambda', 'Lambda', [], ['lambda']],
    ['mu', 'μ', '\\mu', 'Mu', [], ['mu']],
    ['nu', 'ν', '\\nu', 'Nu', [], ['nu']],
    ['xi', 'ξ', '\\xi', 'Xi', [], ['xi']],
    ['omicron', 'ο', '\\omicron', 'Omicron', [], []],
    ['pi', 'π', '\\pi', 'Pi', [], ['pi']],
    ['rho', 'ρ', '\\rho', 'Rho', [], ['rho']],
    ['sigma', 'σ', '\\sigma', 'Sigma', [], ['sigma']],
    ['tau', 'τ', '\\tau', 'Tau', [], ['tau']],
    ['upsilon', 'υ', '\\upsilon', 'Upsilon', [], ['upsilon']],
    ['phi', 'φ', '\\varphi', 'Phi', ['varphi'], ['phi']],
    ['chi', 'χ', '\\chi', 'Chi', [], ['chi']],
    ['psi', 'ψ', '\\psi', 'Psi', [], ['psi']],
    ['omega', 'ω', '\\omega', 'Omega', [], ['omega']],
    ['capital-gamma', 'Γ', '\\Gamma', 'Capital gamma', [], ['Gamma']],
    ['capital-delta', 'Δ', '\\Delta', 'Capital delta', [], ['Delta']],
    ['capital-theta', 'Θ', '\\Theta', 'Capital theta', [], ['Theta']],
    ['capital-lambda', 'Λ', '\\Lambda', 'Capital lambda', [], ['Lambda']],
    ['capital-xi', 'Ξ', '\\Xi', 'Capital xi', [], ['Xi']],
    ['capital-pi', 'Π', '\\Pi', 'Capital pi', [], ['Pi']],
    ['capital-sigma', 'Σ', '\\Sigma', 'Capital sigma', [], ['Sigma']],
    ['capital-upsilon', 'Υ', '\\Upsilon', 'Capital upsilon', [], ['Upsilon']],
    ['capital-phi', 'Φ', '\\Phi', 'Capital phi', [], ['Phi']],
    ['capital-psi', 'Ψ', '\\Psi', 'Capital psi', [], ['Psi']],
    ['capital-omega', 'Ω', '\\Omega', 'Capital omega', [], ['Omega']],
    ['final-sigma', 'ς', '\\varsigma', 'Final sigma', ['varsigma'], ['sigma.alt']],
    ['variant-theta', 'ϑ', '\\vartheta', 'Variant theta', ['vartheta'], ['theta.alt']],
    ['variant-phi', 'ϕ', '\\phi', 'Variant phi', [], ['phi.alt']],
    ['variant-pi', 'ϖ', '\\varpi', 'Variant pi', ['varpi'], ['pi.alt']],
    ['variant-kappa', 'ϰ', '\\varkappa', 'Variant kappa', ['varkappa'], ['kappa.alt']],
    ['variant-rho', 'ϱ', '\\varrho', 'Variant rho', ['varrho'], ['rho.alt']],
    ['variant-epsilon', 'ϵ', '\\epsilon', 'Lunate epsilon', ['variant epsilon'], ['epsilon.alt']],
  ],
};

export const SYMBOL_CATALOG: readonly SymbolDefinition[] = SYMBOL_CATEGORIES.flatMap(category =>
  entries[category].map(([id, glyph, tex, name, aliases, recognizerIds, extensionFamilyIds = []]) =>
    ({id, glyph, tex, name, aliases, category, recognizerIds, extensionFamilyIds})),
);

const ids = new Map(SYMBOL_CATALOG.map(symbol => [symbol.id, symbol]));
const glyphs = new Map(SYMBOL_CATALOG.map(symbol => [symbol.glyph, symbol]));
const recognizerIds = new Map(SYMBOL_CATALOG.flatMap(symbol => symbol.recognizerIds.map(id => [id, symbol] as const)));
export const symbolById = (id: string) => ids.get(id);
export const symbolByGlyph = (glyph: string) => glyphs.get(glyph);
export const symbolByRecognizerId = (id: string) => recognizerIds.get(id);

const normaliseTerms = (value: string) => value.normalize('NFKD').toLowerCase()
  .replace(/\p{Mark}/gu, '').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();

const searchIndex = SYMBOL_CATALOG.map(symbol => ({
  symbol,
  name: normaliseTerms(symbol.name),
  terms: [...new Set([symbol.name, symbol.tex, ...symbol.aliases].map(normaliseTerms).filter(Boolean))],
  commands: [symbol.tex, ...symbol.aliases].filter(value => value.startsWith('\\')),
}));

// A small edit budget allows adjacent transpositions and avoids fuzzy matches on short tokens.
function typoDistance(query: string, term: string): number {
  const limit = query.length >= 8 ? 2 : query.length >= 4 ? 1 : 0;
  if (!limit || Math.abs(query.length - term.length) > limit) return Infinity;
  let previousPrevious: number[] = [];
  let previous = Array.from({length: term.length + 1}, (_, index) => index);
  for (let row = 1; row <= query.length; row++) {
    const current = [row];
    for (let column = 1; column <= term.length; column++) {
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1,
        previous[column - 1] + Number(query[row - 1] !== term[column - 1]));
      if (row > 1 && column > 1 && query[row - 1] === term[column - 2] && query[row - 2] === term[column - 1]) {
        current[column] = Math.min(current[column], previousPrevious[column - 2] + 1);
      }
    }
    previousPrevious = previous;
    previous = current;
  }
  return previous[term.length] <= limit ? previous[term.length] : Infinity;
}

function matchWords(query: readonly string[], term: string): number {
  const words = term.split(' ');
  // All query words must match in order; keep "not", direction and other qualifiers significant.
  let costs = Array<number>(query.length + 1).fill(Infinity);
  costs[0] = 0;
  for (const word of words) {
    const next = costs.slice();
    for (let index = 0; index < query.length; index++) {
      if (!Number.isFinite(costs[index])) continue;
      const part = query[index];
      const edit = part === word ? 0 : index === query.length - 1 && part.length > 1 && word.startsWith(part)
        ? 1 : 4 * typoDistance(part, word);
      next[index + 1] = Math.min(next[index + 1], costs[index] + edit);
    }
    costs = next;
  }
  const best = costs[query.length];
  return best <= 9 ? best + (words.length - query.length) / 10 : Infinity;
}

export function searchSymbols(query: string, category?: SymbolCategory): readonly SymbolDefinition[] {
  const text = query.slice(0, 100).trim();
  const plain = normaliseTerms(text);
  const words = plain.split(' ');
  // Conversational descriptions may start with "looks like" or include an article.
  const description = plain.replace(/^(?:looks like|shaped like|symbol for) +(?:an? +)?/, '')
    .split(' ').filter(word => word !== 'the' && word !== 'an').join(' ');
  const descriptionWords = description && description !== plain ? description.split(' ') : null;
  return searchIndex.flatMap(({symbol, name, terms, commands}) => {
    if (category && symbol.category !== category) return [];
    let rank = Infinity;
    if (!text || text === symbol.glyph || text === symbol.tex || commands.includes(text)) rank = 0;
    else if (text.startsWith('\\')) {
      if (commands.some(command => command.startsWith(text))) rank = 1;
      else if (text.length >= 5) rank = Math.min(...commands.map(command => 10 + typoDistance(text.slice(1), command.slice(1))));
    } else if (plain) {
      if (name === plain) rank = 1;
      else if (terms.includes(plain)) rank = 2;
      else if (terms.some(term => term.startsWith(plain))) rank = 3;
      else {
        rank = Math.min(...terms.map(term => Math.min(5 + matchWords(words, term),
          descriptionWords ? 6 + matchWords(descriptionWords, term) : Infinity)));
      }
    }
    return Number.isFinite(rank) ? [{symbol, rank}] : [];
  }).sort((a, b) => a.rank - b.rank).map(({symbol}) => symbol);
}
