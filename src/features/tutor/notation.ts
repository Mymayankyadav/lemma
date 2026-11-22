import {insertPadText, padEdit, type PadEdit} from '../pad/padEdit';
import {applyCompletion, automaticSpelling, completionProposals, type CompletionProposal} from './input/completionEngine';
import {symbolByGlyph, symbolById} from './input/symbolCatalog';

type NotationKey = readonly [label: string, insert: string];
function symbolKey(id: string, spacing: 'inline' | 'around' | 'after' = 'inline'): NotationKey {
  const {glyph} = symbolById(id)!;
  return [glyph, spacing === 'around' ? ' ' + glyph + ' ' : spacing === 'after' ? glyph + ' ' : glyph];
}

// The keyboard's quick layout uses the same glyphs as the catalogue.
// Multi-part keys are separate, with the learner supplying the contents of every slot.
export const notation: Readonly<Record<string, readonly NotationKey[]>> = {
  '∀∃': [
    symbolKey('forall'), symbolKey('exists'), ['∃!', '∃!'], symbolKey('not'), symbolKey('and', 'around'),
    symbolKey('or', 'around'), symbolKey('implies', 'around'), symbolKey('implied-by', 'around'), symbolKey('iff', 'around'),
    symbolKey('equal', 'around'), symbolKey('not-equal', 'around'), symbolKey('identical', 'around'),
    symbolKey('therefore', 'after'), symbolKey('because', 'after'), symbolKey('qed', 'around'),
    ['s.t.', ' s.t. '], ['iff', ' iff '], ['wlog', 'WLOG '],
  ],
  Sets: [
    symbolKey('element-of', 'around'), symbolKey('not-element-of', 'around'), symbolKey('subset-or-equal', 'around'),
    symbolKey('proper-subset', 'around'), symbolKey('superset-or-equal', 'around'), symbolKey('not-subset', 'around'),
    symbolKey('union', 'around'), symbolKey('intersection', 'around'), symbolKey('set-minus', 'around'),
    symbolKey('empty-set'), symbolKey('complement'), symbolKey('times', 'around'), ['{ }', '{□}'],
    ['{ | }', '{□ | □}'], ['𝒫( )', '𝒫(□)'], symbolKey('big-union'), symbolKey('big-intersection'), ['| |', '|□|'],
  ],
  Maps: [
    ['f: → ', 'f: □ → □'], symbolKey('right-arrow', 'around'), symbolKey('maps-to', 'around'),
    ['f⁻¹( )', 'f⁻¹(□)'], ['⁻¹', '⁻¹'], symbolKey('composition', 'around'), ['id', 'id'], ['f|', 'f|□'],
    symbolKey('congruent', 'around'), symbolKey('tilde', 'around'), ['[x]', '[□]'], ['X/~', 'X/~'],
    symbolKey('hook-arrow', 'around'), symbolKey('two-head-arrow', 'around'),
    ['ker', 'ker '], ['im', 'im '], ['⟨ ⟩', '⟨□⟩'], symbolKey('direct-sum', 'around'),
  ],
  Analysis: [
    symbolKey('epsilon'), symbolKey('delta'), symbolKey('less-than-or-equal', 'around'), symbolKey('greater-than-or-equal', 'around'),
    symbolKey('less-than', 'around'), symbolKey('greater-than', 'around'), symbolKey('infinity'),
    ['lim', 'lim_{□→□} '], ['Σ', 'Σ_{□}^{□} '], ['∫', '∫_{□}^{□} '], ['a/b', '(□)/(□)'],
    ['xⁿ', '^'], ['xₙ', '_'], ['√', '√(□)'], ['‖ ‖', '‖□‖'], ['sup', 'sup '], ['inf', 'inf '],
    symbolKey('approximately-equal', 'around'), ['ℙ', 'ℙ(□)'], ['𝔼', '𝔼[□]'],
    symbolKey('partial'), symbolKey('nabla'), symbolKey('plus-minus'), symbolKey('middle-dot'),
  ],
  Spaces: [
    symbolKey('naturals'), symbolKey('integers'), symbolKey('rationals'), symbolKey('reals'), symbolKey('complexes'),
    ['ℝⁿ', 'ℝⁿ'], symbolKey('script-t'), symbolKey('script-u'), symbolKey('script-b'),
    ['cl', 'cl(□)'], ['int', 'int(□)'], ['Sⁿ', 'Sⁿ'], ['ℝPⁿ', 'ℝPⁿ'], symbolKey('similar-or-equal', 'around'),
    symbolKey('product'), symbolKey('disjoint-union', 'around'), ['lim←', 'lim← '], ['ℤ̂', 'ℤ̂'],
  ],
  Greek: [...'αβγδεζηθικλμνξπρστφχψωΓΔΘΛΞΠΣΦΨΩ'].map(glyph => symbolKey(symbolByGlyph(glyph)!.id)),
  Phrases: [
    ['Let … ∈ …', 'Let □ ∈ □. '], ['Suppose …', 'Suppose □. '], ['Then …', 'Then □. '], ['Hence …', 'Hence □. '],
    ['Since …', 'Since □, '], ['So …', 'So □. '], ['For all …', 'For all □, '],
    ['There is … with …', 'There is □ with □. '], ['Take … ∈ …', 'Take □ ∈ □. '],
    ['Conversely', 'Conversely, '], ['Consider …', 'Consider □. '], ['Let … = …', 'Let □ = □. '],
    ['Given …', 'Given □, '], ['If … then …', 'If □, then □. '], ['I think …', 'I think □. '], ['Why?', 'Why does □?'],
  ],
};

export type NotationSuggestion = CompletionProposal;
export const notationSuggestions = completionProposals;
export const applyNotationSuggestion = applyCompletion;

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

export function typedNotation(edit: PadEdit, text: string, context: readonly string[] = [], keptWords: ReadonlySet<string> = new Set()): PadEdit {
  return automaticSpelling(edit, text, context, keptWords) ?? insertNotation(edit, text);
}
