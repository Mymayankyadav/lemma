import {describe, expect, test} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {applyNotationSuggestion, insertNotation, notation, notationSuggestions, typedNotation}
  from '../../../src/features/tutor/notation';

const context = ['Use induction, contradiction, or your own reasoning', 'preimage f⁻¹(B), ℝ, and Čech', 'Check iff and both inclusions'];
const recent = ['f⁻¹(B)', 'ℝ', 'ε > 0'];

describe('learner-authored completion', () => {
  test.each(['by ', 'if', 'suppose ', 'let x', '∀', '∃', '∃!', 'both ', 'without '])(
    'keeps %s free of inferred wording, strategies, and operands', draft => {
      const proposals = notationSuggestions(padEdit(draft), context, recent);
      expect(proposals).toHaveLength(3);
      expect(proposals.every(proposal => proposal.policyRuleId === 'symbol-choice')).toBe(true);
      expect(proposals.map(proposal => proposal.text)).toEqual(['∃', '∀', '∈']);
    },
  );

  test('completes started words while preserving spelling, suffixes and case', () => {
    const edit = padEdit('PREI, then continue', 4);
    const proposal = notationSuggestions(edit, context, recent)[1];
    expect(proposal).toMatchObject({
      text: 'PREIMAGE', policyRuleId: 'word-prefix', replace: {start: 0, end: 4},
      sourceRanges: [{start: 0, end: 4}],
    });
    expect(applyNotationSuggestion(edit, proposal)).toEqual(padEdit('PREIMAGE, then continue', 8));
    expect(notationSuggestions(padEdit('contrad'), context, recent)[1].text).toBe('contradiction');
    expect(notationSuggestions(padEdit('x'), ['xenon'], recent).every(proposal => proposal.kind !== 'word')).toBe(true);
    expect(notationSuggestions(padEdit('Če'), context, recent)[1].text).toBe('Čech');
    expect(notationSuggestions(padEdit('ČE'), context, recent)[1].text).toBe('ČECH');
  });

  test.each(['for all', 'forall', '\\forall', 'therefore', 'less than', 'there exists'])(
    'offers %s only as an explicit choice', alias => {
      const edit = padEdit(alias);
      const [proposal] = notationSuggestions(edit, context, recent).filter(item => item.policyRuleId === 'exact-alias');
      expect(proposal.sourceRanges).toEqual([{start: 0, end: alias.length}]);
      expect(applyNotationSuggestion(edit, proposal).text).not.toEqual(edit.text);
      expect(typedNotation(edit, ' ', context).text).toBe(alias + ' ');
    },
  );

  test('does not formalize an incomplete alias or a shorter part of a present longer alias', () => {
    const exactAliases = (text: string, caret = text.length) => notationSuggestions(padEdit(text, caret), [], [])
      .filter(item => item.policyRuleId === 'exact-alias').map(item => item.text);
    expect(exactAliases('for al')).toEqual([]);
    expect(exactAliases('less than or equal to', 'less than '.length)).toEqual([]);
    expect(exactAliases('less than or equal to')).toEqual(['≤']);
    expect(exactAliases('there exists a unique', 'there exists '.length)).toEqual([]);
    expect(exactAliases('there exists a unique')).toEqual(['∃!']);
    expect(exactAliases('if and only if')).toEqual(['⇔']);
    expect(exactAliases('x is not in')).toEqual(['∉']);
    expect(exactAliases('x_forall')).toEqual([]);
    expect(exactAliases('x \\\\forall')).toEqual([]);
  });

  test('preserves meaningful symbol alternatives and requires explicit notation for conventions', () => {
    const aliases = (source: string) => notationSuggestions(padEdit(source), context, recent)
      .filter(item => item.policyRuleId === 'exact-alias').map(item => item.text);
    expect(aliases('subset').sort()).toEqual(['⊂', '⊆']);
    expect(aliases('not a subset').sort()).toEqual(['⊄', '⊈']);
    expect(aliases('\\subset')).toEqual(['⊂']);
    expect(aliases('subseteq')).toEqual(['⊆']);
    expect(aliases('proper subset')).toEqual(['⊊']);
    expect(aliases('contains')).toEqual([]);
    expect(aliases('isomorphic to')).toEqual([]);
    expect(aliases('congruent to')).toEqual([]);
    expect(aliases('homeomorphic to')).toEqual([]);
  });

  test('reformats only the explicitly supplied declaration and preserves following text', () => {
    const before = 'Earlier line.\n  let θ in ℝ';
    const edit = padEdit(before + '\nContinue the argument.', before.length);
    const proposal = notationSuggestions(edit, context, recent)[1];
    expect(proposal).toMatchObject({text: 'Let θ ∈ ℝ.', policyRuleId: 'supplied-declaration'});
    expect(proposal.sourceRanges.map(range => edit.text.slice(range.start, range.end))).toEqual(['let', 'θ', 'in', 'ℝ']);
    expect(applyNotationSuggestion(edit, proposal).text).toBe('Earlier line.\n  Let θ ∈ ℝ.\nContinue the argument.');
    expect(notationSuggestions(padEdit('let θ in A ∩ B', 'let θ in A'.length), context, recent)
      .every(item => item.policyRuleId !== 'supplied-declaration')).toBe(true);
  });

  test('reformats the supplied quantifier, domain, and verbatim predicate only', () => {
    const edit = padEdit('for every x in A, P(x, y).');
    const proposal = notationSuggestions(edit, context, recent)[1];
    expect(proposal.policyRuleId).toBe('supplied-quantifier');
    expect(proposal.sourceRanges.map(range => edit.text.slice(range.start, range.end))).toEqual(['for every', 'x', 'in', 'A', 'P(x, y)']);
    expect(applyNotationSuggestion(edit, proposal).text).toBe('∀x ∈ A, P(x, y).');
    expect(notationSuggestions(padEdit('for every x in A, '), context, recent)
      .every(item => item.policyRuleId !== 'supplied-quantifier')).toBe(true);
  });

  test('revalidates the complete source snapshot and both revisions before applying', () => {
    const edit = padEdit('prei suffix', 4);
    const revisions = {editorRevision: 5, selectionRevision: 2};
    const proposal = notationSuggestions(edit, context, recent, [], revisions)[1];
    expect(applyNotationSuggestion(edit, proposal, revisions).text).toBe('preimage suffix');
    expect(applyNotationSuggestion(edit, proposal, {...revisions, editorRevision: 6})).toBe(edit);
    expect(applyNotationSuggestion(edit, proposal, {...revisions, selectionRevision: 3})).toBe(edit);
    const moved = padEdit(edit.text, 3);
    const replaced = padEdit('prei changed', 4);
    expect(applyNotationSuggestion(moved, proposal, revisions)).toBe(moved);
    expect(applyNotationSuggestion(replaced, proposal, revisions)).toBe(replaced);
  });

  test('retains center-ranked corrections, explicit keep and conservative typing corrections', () => {
    const edit = padEdit('teh');
    const proposals = notationSuggestions(edit, context, recent);
    expect(proposals.map(proposal => [proposal.text, proposal.kind])).toEqual([['teh', 'keep'], ['the', 'fix'], ['∀', 'sym']]);
    expect(applyNotationSuggestion(edit, proposals[0]).text).toBe('teh ');
    expect(typedNotation(edit, ' ', context).text).toBe('the ');
    expect(typedNotation(edit, ' ', context, new Set(['teh'])).text).toBe('teh ');
    expect(typedNotation(padEdit('let teh'), ' ', context).text).toBe('let teh ');
  });

  test('keeps neutral keyboard scaffolds explicit and leaves their math slots open', () => {
    const key = notation.Phrases.find(([label]) => label === 'Let … ∈ …');
    expect(insertNotation(padEdit(''), key![1])).toEqual(padEdit('Let □ ∈ □. ', 4, 5));
    expect(notation.Phrases.flat().join(' ')).not.toMatch(/Then y = f\(x\)|ε > 0|Both inclusions|by induction/i);
  });
});
