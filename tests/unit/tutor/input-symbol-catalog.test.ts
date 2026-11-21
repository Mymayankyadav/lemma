import katex from 'katex';
import {describe, expect, test} from 'vitest';
import metadata from '../../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/infer.json';
import {changePadText, createPadTextHistory, padEdit, undoPadText} from '../../../src/features/pad/padEdit';
import {applyNotationSuggestion, notationSuggestions} from '../../../src/features/tutor/notation';
import {searchSymbols, symbolByGlyph, symbolById, symbolByRecognizerId, SYMBOL_CATALOG}
  from '../../../src/features/tutor/input/symbolCatalog';
import {insertTutorSymbol, tutorMathContext} from '../../../src/features/tutor/input/symbolEdit';

describe('canonical symbols', () => {
  test('maps exact glyphs to model labels and leaves unsupported model classes unmapped', () => {
    expect(new Set(SYMBOL_CATALOG.map(item => item.id)).size).toBe(SYMBOL_CATALOG.length);
    expect(new Set(SYMBOL_CATALOG.map(item => item.glyph)).size).toBe(SYMBOL_CATALOG.length);
    for (const item of SYMBOL_CATALOG) {
      expect(symbolByGlyph(item.glyph)).toBe(item);
      expect(symbolById(item.id)).toBe(item);
      for (const recognizerId of item.recognizerIds) {
        expect(metadata.find(({names}) => names.includes(recognizerId))?.char).toBe(item.glyph);
        expect(symbolByRecognizerId(recognizerId)).toBe(item);
      }
      for (const extensionId of item.extensionFamilyIds) expect(symbolById(extensionId)).toBeDefined();
    }
    expect(symbolByRecognizerId('epsilon')?.glyph).toBe('ε');
    expect(symbolByRecognizerId('epsilon.alt')?.glyph).toBe('ϵ');
    expect(symbolByRecognizerId('earth')).toBeUndefined();
    expect(symbolById('less-than')?.recognizerIds).toEqual([]);
  });

  test('searches by exact glyph, text aliases, math commands, and category', () => {
    expect(searchSymbols('∀')[0]?.id).toBe('forall');
    expect(searchSymbols('for all')[0]?.id).toBe('forall');
    expect(searchSymbols('not element of')[0]?.id).toBe('not-element-of');
    expect(searchSymbols('epsilon')[0]?.id).toBe('epsilon');
    expect(searchSymbols('\\epsilon')[0]?.id).toBe('variant-epsilon');
    expect(searchSymbols('\\Delta')[0]?.id).toBe('capital-delta');
    expect(searchSymbols('\\neq')[0]?.id).toBe('not-equal');
    expect(searchSymbols('subset').map(item => item.glyph)).toEqual(expect.arrayContaining(['⊂', '⊆', '⊊']));
    expect(searchSymbols('', 'Greek').every(item => item.category === 'Greek')).toBe(true);
    expect(searchSymbols('epsilon', 'Sets')).toEqual([]);
    expect(searchSymbols('')).toEqual(SYMBOL_CATALOG);
  });

  test.each([
    ['infinty', 'infinity'],
    ['aproximatly equal', 'approximately-equal'],
    ['elmeent of', 'element-of'],
    ['not elmeent of', 'not-element-of'],
    ['less than or eq', 'less-than-or-equal'],
    ['subse', 'subset'],
    ['upsidé-down A', 'forall'],
    ['looks like a backwards E', 'exists'],
    ['curvy e', 'element-of'],
    ['curvy E slash', 'not-element-of'],
    ['sideways figure eight', 'infinity'],
    ['backwards curvy e', 'contains-element'],
    ['\\Delt', 'capital-delta'],
    ['\\delt', 'delta'],
    ['\\inft', 'infinity'],
    ['\\infty', 'infinity'],
  ])('ranks %s as %s', (query, id) => {
    expect(searchSymbols(query)[0]?.id).toBe(id);
  });

  test('keeps ambiguous descriptions as choices and rejects unrelated or incomplete typo matches', () => {
    expect(searchSymbols('squiggle').map(item => item.id))
      .toEqual(expect.arrayContaining(['tilde', 'similar', 'infinity']));
    expect(searchSymbols('cooking utensil')).toEqual([]);
    expect(searchSymbols('xqz')).toEqual([]);
    expect(searchSymbols('aquarium diagonal').map(item => item.id)).toEqual([]);
    expect(searchSymbols('infinty', 'Greek')).toEqual([]);
    expect(searchSymbols('\\theta')[0]?.id).toBe('theta');
    expect(searchSymbols('\\Theta')[0]?.id).toBe('capital-theta');
  });

  test('serializes every canonical TeX spelling through the math renderer', () => {
    for (const item of SYMBOL_CATALOG) {
      expect(() => katex.renderToString('x' + item.tex + ' y', {strict: 'error', throwOnError: true}), item.id).not.toThrow();
    }
  });
});

describe('canonical symbol edits', () => {
  test('inserts Unicode in prose and preserves UTF-16 offsets and surrounding text', () => {
    const edit = padEdit('A😊/B', 3, 4, 'backward');
    const result = insertTutorSymbol(edit, 'expectation')!;
    expect(result).toEqual(padEdit('A😊𝔼B', 5));
    expect(undoPadText(changePadText(createPadTextHistory(edit), result)).present).toEqual(edit);
    expect(insertTutorSymbol(edit, 'earth')).toBeUndefined();
  });

  test.each([
    ['x $a□b$ suffix', 'x $a\\leq b$ suffix'],
    ['x $$a□b$$ suffix', 'x $$a\\leq b$$ suffix'],
    ['x \\(a□b\\) suffix', 'x \\(a\\leq b\\) suffix'],
    ['x \\[a□b\\] suffix', 'x \\[a\\leq b\\] suffix'],
    ['x $a□b', 'x $a\\leq b'],
    ['x \\$a□b', 'x \\$a≤b'],
  ])('encodes a selected slot in %s', (source, target) => {
    const slot = source.indexOf('□');
    expect(insertTutorSymbol(padEdit(source, slot, slot + 1), 'less-than-or-equal')?.text).toBe(target);
  });

  test('terminates a control word before a closing delimiter and preserves its insertion caret', () => {
    const edit = padEdit('$x$', 2);
    expect(insertTutorSymbol(edit, 'element-of')).toEqual(padEdit('$x\\in $', 6));
    const aliasEdit = padEdit('$x less than or equal to$', 24);
    const alias = notationSuggestions(aliasEdit, [], []).find(item => item.policyRuleId === 'exact-alias')!;
    expect(applyNotationSuggestion(aliasEdit, alias).text).toBe('$x \\leq $');
  });

  test('rejects a mixed prose/math selection or a caret inside a delimiter', () => {
    const text = 'before \\(x\\) suffix';
    expect(insertTutorSymbol(padEdit(text, 4, 10), 'forall')).toBeUndefined();
    expect(insertTutorSymbol(padEdit(text, 6, 14), 'forall')).toBeUndefined();
    expect(insertTutorSymbol(padEdit(text, 8), 'forall')).toBeUndefined();
    expect(tutorMathContext(padEdit(text, 10))).toBe('tex');
    expect(tutorMathContext(padEdit(text, 12))).toBe('prose');
  });
});
