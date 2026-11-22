import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect, test} from 'vitest';
import manifest from '../../../public/models/equation-assist/autoeq-v1.4/manifest.json';
import {
  applyEquationCandidate, autoeqInput, equationSelection, localEquationCandidates, modelEquationCandidates,
} from '../../../src/features/pad/equationAssist/candidates';
import {renderPadMath} from '../../../src/features/pad/LocalPadPreview';
import {applyPadNotation, padEdit, padNotationSuggestion, PAD_SLOT} from '../../../src/features/pad/padEdit';

function selected(text: string, expression = text) {
  const start = text.indexOf(expression);
  return padEdit(text, start, start + expression.length);
}
function alternatives(text: string, expression = text) {
  return localEquationCandidates(equationSelection(selected(text, expression))!);
}

test.each([
  ['A circle centered at the origin, with unit coefficients: ', 'Powers', 'x^{2}+y^{2}=2'],
  ['These are the second terms of two sequences: ', 'Subscripts', 'x_{2}+y_{2}=2'],
  ['Trailing digits are coefficients in this linear equation: ', 'Trailing coefficients', '2x+2y=2'],
])('uses context %s to rank distinct readings of the same selection', (context, label, latex) => {
  const result = alternatives(context + 'x2+y2=2', 'x2+y2=2');
  expect(result[0]).toEqual({label, latex});
  expect(result.map(option => option.latex).sort()).toEqual(['2x+2y=2', 'x^{2}+y^{2}=2', 'x_{2}+y_{2}=2'].sort());
});

test('renders common verbal formulas, domains, and explicit quantifiers', () => {
  expect(alternatives('root 2')[0].latex).toBe('\\sqrt{2}');
  expect(alternatives('let p be a polynomial in x with real coefficients')[0].latex)
    .toBe('p\\in\\mathbb{R}[x]');
  expect(alternatives('let p be polynomials with coefficients in R').map(option => option.latex))
    .toEqual(['p\\text{ be a polynomial over }\\mathbb{R}', 'p\\in\\mathbb{R}[X]']);
  expect(alternatives('every real x has x squared greater than or equal to zero')[0].latex)
    .toBe('\\forall x\\in\\mathbb{R},\\;x^2\\ge 0');
  expect(alternatives('let p be a polynomial in x with coefficients in ℝ')[0].latex)
    .toBe('p\\in\\mathbb{R}[x]');
  expect(alternatives('for all x in ℝ, x2>=0')[0].latex)
    .toBe('\\forall x\\in\\mathbb{R},\\;x^{2}\\ge 0');
  expect(alternatives('some integer n satisfies n squared equals 4')[0].latex)
    .toBe('\\exists n\\in\\mathbb{Z},\\;n^2=4');
  const reading = alternatives("there isn't a rational q whose square is 3")[0];
  expect(reading.latex).toBe('\\nexists q\\in\\mathbb{Q},\\;q^2=3');
  expect(renderPadMath(reading.latex)).toContain('<math');
});

test('keeps both plausible spoken fraction scopes', () => {
  expect(alternatives('one over x plus two').map(candidate => candidate.latex))
    .toEqual(['\\frac{1}{x}+2', '\\frac{1}{x+2}']);
});

test('replaces one selection and balances existing delimiters', () => {
  const text = 'before $  x2+y2=2  $ after';
  const edit = selected(text, '$  x2+y2=2  $');
  const range = equationSelection(edit)!;
  const candidate = localEquationCandidates(range)[0];
  expect(applyEquationCandidate(edit, range, candidate).text).toBe('before $x_{2}+y_{2}=2$ after');
  const proof = selected('In this proof, let p be a polynomial in x with real coefficients.', 'let p be a polynomial in x with real coefficients');
  const proofSelection = equationSelection(proof)!;
  expect(applyEquationCandidate(proof, proofSelection, localEquationCandidates(proofSelection)[0]).text)
    .toBe('In this proof, let \\(p\\in\\mathbb{R}[x]\\).');
  expect(equationSelection(selected('first $x$ last'))).toBeNull();
  expect(equationSelection(selected('x'.repeat(129)))).toBeNull();
});

test('keeps local model input bounded to math and drops guesses that alter numeric facts', () => {
  expect(autoeqInput('We adjourned the meeting at 4')).toBeNull();
  expect(autoeqInput('a+b/c')).toBe('a+b/c');
  expect(modelEquationCandidates('x2+y2=2', ['x^2+y^2=2=2', 'x^2+y^2=3', 'x^2+y^2=2', 'x^{2}+y^{2}=2']))
    .toEqual([{label:'Interpretation 1', latex:'x^2+y^2=2'}]);
  expect(modelEquationCandidates('root 2', ['\\sqrt[2]{}', '\\sqrt{2}']).map(item => item.latex))
    .toEqual(['\\sqrt{2}']);
});

test.each([
  ['sqrt(', 'Square root', '\\(\\sqrt{'+PAD_SLOT+'}\\)'],
  ['frac(', 'Fraction', '\\(\\frac{'+PAD_SLOT+'}{'+PAD_SLOT+'}\\)'],
  ['x^', 'Exponent', '\\({x}^{'+PAD_SLOT+'}\\)'],
  ['$x_', 'Subscript', '$'+'{x}_{'+PAD_SLOT+'}'],
])('autocomplete for %s exposes an empty notation slot', (prefix, template, value) => {
  const edit = padEdit(prefix);
  const suggestion = padNotationSuggestion(edit)!;
  expect(suggestion.template).toBe(template);
  const next = applyPadNotation(edit, suggestion);
  expect(next.text).toBe(value);
  expect(next.text.slice(next.start, next.end)).toBe(PAD_SLOT);
});

test('typing a familiar expression does not suggest its mathematical continuation', () => {
  expect(padNotationSuggestion(padEdit('sin^2 x +'))).toBeNull();
  expect(padNotationSuggestion(padEdit('sqrt(2'))).toBeNull();
  expect(padNotationSuggestion(padEdit('x2+y2='))).toBeNull();
  expect(padNotationSuggestion(padEdit('sqrt(2)', 5))).toBeNull();
});

test('bundles the pinned local INT8 assets', () => {
  expect(manifest.revision).toBe('ca8fdda9fe8311b0b9b4cd2e7a591f2b66a292f5');
  expect(manifest.license).toBe('Apache-2.0');
  for (const file of Object.values(manifest.files)) {
    const bytes = readFileSync(new URL('../../../public/models/equation-assist/autoeq-v1.4/' + file.path, import.meta.url));
    expect(bytes.length).toBe(file.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
  }
});
