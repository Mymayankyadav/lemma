import {insertPadText, padEdit, type PadEdit} from '../pad/padEdit';

// Symbol and proof-phrase layouts from the supplied tutor keyboard.
export const notation: Readonly<Record<string, readonly (readonly string[])[]>> = {
  '∀∃': [['∀', '∀'], ['∃', '∃'], ['∃!', '∃!'], ['¬', '¬'], ['∧', ' ∧ '], ['∨', ' ∨ '], ['⇒', ' ⇒ '], ['⇐', ' ⇐ '], ['⇔', ' ⇔ '], ['=', ' = '], ['≠', ' ≠ '], ['≡', ' ≡ '], ['∴', '∴ '], ['∵', '∵ '], ['∎', ' ∎'], ['s.t.', ' s.t. '], ['iff', ' iff '], ['wlog', 'WLOG ']],
  Sets: [['∈', ' ∈ '], ['∉', ' ∉ '], ['⊆', ' ⊆ '], ['⊊', ' ⊊ '], ['⊇', ' ⊇ '], ['⊄', ' ⊄ '], ['∪', ' ∪ '], ['∩', ' ∩ '], ['∖', ' ∖ '], ['∅', '∅'], ['ᶜ', 'ᶜ'], ['×', ' × '], ['{ }', '{□}'], ['{ | }', '{□ | □}'], ['𝒫( )', '𝒫(□)'], ['⋃', '⋃'], ['⋂', '⋂'], ['| |', '|□|']],
  Maps: [['f: → ', 'f: □ → □'], ['→', ' → '], ['↦', ' ↦ '], ['f⁻¹( )', 'f⁻¹(□)'], ['⁻¹', '⁻¹'], ['∘', ' ∘ '], ['id', 'id'], ['f|', 'f|□'], ['≅', ' ≅ '], ['~', ' ~ '], ['[x]', '[□]'], ['X/~', 'X/~'], ['↪', ' ↪ '], ['↠', ' ↠ '], ['ker', 'ker '], ['im', 'im '], ['⟨ ⟩', '⟨□⟩'], ['⊕', ' ⊕ ']],
  Analysis: [['ε', 'ε'], ['δ', 'δ'], ['≤', ' ≤ '], ['≥', ' ≥ '], ['<', ' < '], ['>', ' > '], ['∞', '∞'], ['lim', 'lim_{□→□} '], ['Σ', 'Σ_{□}^{□} '], ['∫', '∫_{□}^{□} '], ['a/b', '(□)/(□)'], ['xⁿ', '^'], ['xₙ', '_'], ['√', '√(□)'], ['‖ ‖', '‖□‖'], ['sup', 'sup '], ['inf', 'inf '], ['≈', ' ≈ '], ['ℙ', 'ℙ(□)'], ['𝔼', '𝔼[□]'], ['∂', '∂'], ['∇', '∇'], ['±', '±'], ['·', '·']],
  Spaces: [['ℕ', 'ℕ'], ['ℤ', 'ℤ'], ['ℚ', 'ℚ'], ['ℝ', 'ℝ'], ['ℂ', 'ℂ'], ['ℝⁿ', 'ℝⁿ'], ['𝒯', '𝒯'], ['𝒰', '𝒰'], ['ℬ', 'ℬ'], ['cl', 'cl(□)'], ['int', 'int(□)'], ['Sⁿ', 'Sⁿ'], ['ℝPⁿ', 'ℝPⁿ'], ['≃', ' ≃ '], ['∏', '∏'], ['⊔', ' ⊔ '], ['lim←', 'lim← '], ['ℤ̂', 'ℤ̂']],
  Greek: 'αβγδεζηθικλμνξπρστφχψωΓΔΘΛΞΠΣΦΨΩ'.split('').map(g => [g, g]),
  Phrases: [['Let … ∈ …', 'Let □ ∈ □. '], ['Suppose …', 'Suppose □. '], ['Then …', 'Then □. '], ['Hence … ∎', 'Hence □. ∎'],
    ['Since …', 'Since □, '], ['so …', 'so □. '], ['for all …', 'for all □, '], ['there is … with …', 'there is □ with □. '],
    ['Take y ∈ f(…)', 'Take y ∈ f(□). Then y = f(x) for some x ∈ □. '], ['Conversely', 'Conversely, '],
    ['Suppose not', 'Suppose not: □. '], ['Counterexample', 'Counterexample: □. '], ['Both inclusions', 'We show □ ⊆ □ and □ ⊆ □. '],
    ['ε–N', 'Given ε > 0 there is N with |aₙ − □| < ε for all n ≥ N. '],
    ['by induction', 'By induction on □. '], ['by definition', 'by definition, '], ['I think…', 'I think '], ['Why?', 'Why does □?']],
};

const PHRASES: readonly (readonly [string, string, number?, number?])[] = [
  ['for all', '∀', 1], ['for every', '∀', 1], ['for each', '∀', 1], ['forall', '∀', 1],
  ['there exists', '∃', 1], ['there exist', '∃', 1], ['there is', '∃'], ['exists', '∃'], ['for some', '∃', 1],
  ['there exists a unique', '∃!', 1], ['exists unique', '∃!', 1],
  ['is equal to', '=', 1], ['equal to', '=', 1], ['equals', '='], ['equal', '='],
  ['is not equal to', '≠', 1], ['not equal to', '≠', 1], ['not equal', '≠', 1], ['neq', '≠', 1],
  ['less than or equal to', '≤', 1], ['less than or equal', '≤', 1], ['at most', '≤'], ['leq', '≤', 1],
  ['greater than or equal to', '≥', 1], ['greater than or equal', '≥', 1], ['at least', '≥'], ['geq', '≥', 1],
  ['less than', '<', 1], ['greater than', '>', 1],
  ['is an element of', '∈', 1], ['is in', '∈'], ['element of', '∈', 1], ['belongs to', '∈', 1], ['in', '∈'],
  ['not an element of', '∉', 1], ['not in', '∉', 1],
  ['is a subset of', '⊆', 1], ['subset of', '⊆', 1], ['contained in', '⊆', 1], ['subseteq', '⊆', 1], ['subset', '⊆'],
  ['proper subset of', '⊊', 1], ['superset of', '⊇', 1], ['contains', '⊇'],
  ['union', '∪'], ['cup', '∪', 1], ['intersection', '∩'], ['intersect', '∩'], ['cap', '∩', 1],
  ['set minus', '∖', 1], ['setminus', '∖', 1], ['minus', '−'],
  ['empty set', '∅', 1], ['emptyset', '∅', 1], ['complement', 'ᶜ', 0, 1],
  ['implies', '⇒'], ['implies that', '⇒', 1], ['if and only if', '⇔', 1], ['iff', '⇔'],
  ['maps to', '↦', 1], ['goes to', '→', 1], ['tends to', '→', 1], ['to', '→'],
  ['inverse', '⁻¹', 0, 1], ['inv', '⁻¹', 0, 1], ['squared', '²', 0, 1], ['cubed', '³', 0, 1], ['to the n', 'ⁿ', 1, 1],
  ['infinity', '∞'], ['epsilon', 'ε'], ['eps', 'ε'], ['delta', 'δ'], ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'],
  ['lambda', 'λ'], ['mu', 'μ'], ['pi', 'π'], ['sigma', 'σ'], ['tau', 'τ'], ['phi', 'φ'], ['psi', 'ψ'], ['omega', 'ω'],
  ['theta', 'θ'], ['rho', 'ρ'], ['kappa', 'κ'], ['chi', 'χ'], ['xi', 'ξ'], ['eta', 'η'], ['zeta', 'ζ'], ['nu', 'ν'],
  ['times', '×'], ['composed with', '∘', 1], ['compose', '∘'], ['circ', '∘', 1],
  ['is equivalent to', '~', 1], ['equivalent to', '~', 1], ['related to', '~', 1], ['sim', '~'],
  ['isomorphic to', '≅', 1], ['congruent to', '≅', 1], ['homeomorphic to', '≅', 1],
  ['therefore', '∴'], ['because', '∵'], ['qed', '∎', 1],
  ['reals', 'ℝ'], ['real numbers', 'ℝ', 1], ['naturals', 'ℕ'], ['natural numbers', 'ℕ', 1], ['integers', 'ℤ'],
  ['rationals', 'ℚ'], ['rational numbers', 'ℚ', 1], ['complex numbers', 'ℂ', 1],
  ['sum', 'Σ'], ['product', '∏'], ['integral', '∫'], ['sqrt', '√(□)', 1], ['square root of', '√(□)', 1],
  ['norm of', '‖□‖', 1], ['absolute value of', '|□|', 1], ['power set of', '𝒫(□)', 1], ['power set', '𝒫(□)'],
  ['approximately', '≈'], ['approx', '≈', 1], ['plus or minus', '±', 1], ['partial', '∂'], ['nabla', '∇'],
  ['such that', 's.t.'], ['and', '∧'], ['or', '∨'], ['not', '¬'],
];
const POSTFIX = new Set(['⁻¹', '²', '³', 'ⁿ', 'ᶜ']);

// ---------- 2. a starter vocabulary (base frequencies; your own words are learned on top) ----------
const VOCAB = ('the a an is are be by of to in on at for from with that this then thus hence so since because if iff and or not '
  + 'let suppose assume take consider fix choose given define defined denote write we have get show prove proof claim '
  + 'it its there exists exist every each all any some no none only unique uniquely both either neither other another '
  + 'such where which when while whenever therefore conversely similarly likewise moreover furthermore however indeed '
  + 'follows following implies implying means meaning gives giving yields yielding shows showing proves proving '
  + 'contradiction contradicts absurd case cases otherwise first second finally next now note recall observe '
  + 'definition by-definition lemma theorem corollary proposition hypothesis assumption induction base step inductive '
  + 'function map maps mapping image images preimage preimages inverse injective surjective bijective injection surjection bijection '
  + 'identity composition composite restriction extension domain codomain range kernel fibre fibres fiber fibers '
  + 'set sets subset subsets superset element elements member members union intersection complement difference empty '
  + 'finite infinite countable uncountable family indexed collection partition partitions class classes representative '
  + 'relation relations equivalence reflexive symmetric transitive antisymmetric order ordering partial total chain chains '
  + 'generated generates smallest largest least greatest minimal maximal upper lower bound bounds supremum infimum '
  + 'quotient quotients projection canonical natural well-defined independent choice axiom zorn '
  + 'topology topological space spaces open closed closure interior boundary dense neighbourhood neighborhood basis base '
  + 'subspace product continuous continuity homeomorphism homeomorphic compact compactness connected connectedness '
  + 'path hausdorff metric distance ball limit limits converges convergent convergence sequence sequences subsequence '
  + 'cauchy bounded unbounded increasing decreasing monotone positive negative zero nonzero integer integers real reals '
  + 'number numbers rational irrational even odd prime divides divisible multiple greater less equal equals than at most least '
  + 'group groups subgroup normal homomorphism isomorphism isomorphic ring field vector linear module '
  + 'true false holds hold satisfies satisfy satisfying contains contain containing belongs belong lies lie '
  + 'arbitrary fixed given same different distinct disjoint nonempty pairwise mutually exactly unique '
  + 'need want check verify suffices enough remains left right side direction inclusion inclusions both '
  + 'hint stuck think sure why how what yes ok okay').split(/\s+/);
const BASE_NEXT: Readonly<Record<string, readonly string[]>> = {
  // common continuations in written proofs (seed for next-word prediction)
  'such': ['that'], 'if': ['and only if', 'x ∈'], 'there': ['exists', 'is'], 'by': ['definition', 'induction', 'contradiction', 'assumption'],
  'we': ['have', 'get', 'show', 'need'], 'it': ['follows', 'suffices'], 'follows': ['that'], 'suffices': ['to show'],
  'suppose': ['that', 'not'], 'let': [], 'so': ['that'], 'since': [], 'hence': [], 'thus': [], 'then': [],
  'for': ['all', 'some', 'every', 'each'], 'is': ['a', 'an', 'the', 'not'], 'both': ['inclusions', 'directions'],
  'without': ['loss of generality'], 'as': ['required', 'claimed'], 'in': ['particular'], 'on': ['the other hand'],
  'well': ['defined'], 'if and only if': [], 'contradiction': ['.'], 'conversely': [','], 'take': [], 'fix': [],
  'equivalence': ['relation', 'class', 'classes'], 'smallest': ['equivalence relation'], 'finite': ['chain', 'set'],
};

export interface NotationSuggestion {
  text: string;
  start: number;
  kind: 'sym' | 'word' | 'next' | 'kit';
}

export function insertNotation(edit: PadEdit, text: string): PadEdit {
  const inserted = insertPadText(edit, text);
  const slot = text.indexOf('□');
  if (slot < 0) return inserted;
  return padEdit(inserted.text, edit.start + slot, edit.start + slot + 1);
}

export function findNotationSlot(edit: PadEdit, backward = false): PadEdit | undefined {
  const index = backward
    ? (edit.start > 0 ? edit.text.lastIndexOf('□', edit.start - 1) : -1)
    : edit.text.indexOf('□', edit.end);
  const slot = index >= 0 ? index : backward ? edit.text.lastIndexOf('□') : edit.text.indexOf('□');
  if (slot >= 0) return padEdit(edit.text, slot, slot + 1);
}

function phraseSuggestions(edit: PadEdit, automatic = false): NotationSuggestion[] {
  const before = edit.text.slice(0, edit.start);
  if (edit.start !== edit.end || /[\p{L}\p{N}]/u.test(edit.text[edit.end] ?? '')) return [];
  const words = before.slice(-100).match(/\b[A-Za-z]+(?:[ -]+[A-Za-z]+)*$/);
  if (!words) return [];
  const matches = PHRASES.flatMap(([phrase, text, auto, post]) => {
    if (automatic && !auto) return [];
    const tail = words[0].split(' ').slice(-phrase.split(' ').length).join(' ').toLowerCase();
    if (tail !== phrase && (automatic || tail.length < 3 || !phrase.startsWith(tail))) return [];
    let start = edit.start - tail.length;
    if (post) start = before.slice(0, start).trimEnd().length;
    return [{text, start, kind: 'sym' as const}];
  }).sort((a, b) => a.start - b.start);
  return matches.filter(match => match.start === matches[0]?.start);
}

export function notationSuggestions(edit: PadEdit, context: readonly string[], recent: readonly string[]): NotationSuggestion[] {
  const before = edit.text.slice(0, edit.start);
  const items = new Map<string, NotationSuggestion>();
  const add = (text: string, kind: NotationSuggestion['kind'], start = edit.start) => {
    if (!items.has(text) && items.size < 14) items.set(text, {text, kind, start});
  };
  const prefix = before.match(/[a-z][a-z'-]*$/i)?.[0];
  const canComplete = prefix && edit.start === edit.end && !/[\p{L}\p{N}]/u.test(edit.text[edit.end] ?? '');
  const contextText = context.join(' ').slice(0, 6000);
  const terms = [...new Set(contextText.match(/\b[a-z]{3,}\b/gi) ?? [])];
  phraseSuggestions(edit).forEach(({text, start}) => add(text, 'sym', start));
  if (canComplete) {
    const lower = prefix.toLowerCase();
    for (const word of [...terms, ...VOCAB]) {
      if (word.length > prefix.length && word.toLowerCase().startsWith(lower)) {
        add(prefix + word.slice(prefix.length), 'word', edit.start - prefix.length);
        if (items.size >= 6) break;
      }
    }
  }
  if (!prefix && edit.start === edit.end) {
    const last = before.trimEnd().match(/(?:[a-z]+|[∀∃∈∉⊆⊇⇒]+)!?$/i)?.[0];
    const sets = [...new Set(contextText.match(/\b[A-Z]\b|[ℕℤℚℝℂ]/gu) ?? [])];
    const symbols: Readonly<Record<string, readonly string[]>> = {
      '∀': ['x ∈', 'ε > 0'], '∃': ['x ∈', 'δ > 0'], '∃!': ['x ∈'], '∈': sets, '∉': sets, '⊆': sets, '⊇': sets,
    };
    if (last) {
      symbols[last]?.forEach(text => add(text, 'sym'));
      BASE_NEXT[last.toLowerCase()]?.forEach(text => add(text, 'next'));
    }
  }
  const snippets = contextText.match(/\b[A-Za-z]⁻¹\([A-Za-z]\)|\b[A-Za-z]\([A-Za-z]\)|[ℕℤℚℝℂ]/gu) ?? [];
  snippets.forEach(text => add(text, 'kit'));
  recent.forEach(text => add(text, 'sym'));
  ['∀', '∃', '∈', '⊆', '⇒', 'ℝ'].forEach(text => add(text, 'sym'));
  return [...items.values()];
}

export function applyNotationSuggestion(edit: PadEdit, {text, start, kind}: NotationSuggestion): PadEdit {
  const before = edit.text.slice(0, start);
  const postfix = POSTFIX.has(text) || /^[⁻(,.;:)\]]/u.test(text);
  const space = kind !== 'word' && before && !/[\s([{]$/u.test(before) && !postfix ? ' ' : '';
  const trail = /[\s(□]$/u.test(text) || /^\s/u.test(edit.text.slice(edit.end)) ? '' : ' ';
  return insertNotation(padEdit(edit.text, start, edit.end), space + text + trail);
}

export function typedNotation(edit: PadEdit, text: string): PadEdit {
  const match = /^[ ,.;]$/u.test(text) ? phraseSuggestions(edit, true)[0] : undefined;
  if (!match) return insertNotation(edit, text);
  const applied = applyNotationSuggestion(edit, match);
  if (applied.start !== applied.end) return applied;
  if (text === ' ') return applied;
  const separator = applied.text[applied.start - 1] === ' ' ? applied.start - 1 : applied.start;
  return insertPadText(padEdit(applied.text, separator, applied.start), text);
}
