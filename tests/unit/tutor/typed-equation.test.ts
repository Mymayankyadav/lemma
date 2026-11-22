import {describe, expect, it} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {typedEquationAt} from '../../../src/features/tutor/input/typedEquation';

const at = (text: string) => typedEquationAt(padEdit(text, text.length));

// N223 (Owner: "Auto eq doesn't work in the chat box"): what of the answer autoeq reads.
describe('typed equation at the caret', () => {
  it('finds the equation just typed, after the prose before it', () => {
    expect(at('x1 + x2 = 4')).toMatchObject({text: 'x1 + x2 = 4', start: 0, context: ''});
    expect(at('Let x1 + x2 = 4')).toMatchObject({text: 'x1 + x2 = 4', start: 4, context: 'Let'});
    expect(at('The circle x2+y2=1 ')).toMatchObject({text: 'x2+y2=1', context: 'The circle'});
    expect(at('so sin x = 1/2')).toMatchObject({text: 'sin x = 1/2'});
    expect(at('Let a = 2')).toMatchObject({text: 'a = 2'});
    expect(at('a1')).toMatchObject({text: 'a1'});
  });
  it('leaves prose, lone numbers, signs being typed and maths already in $…$ alone', () => {
    for (const text of ['This is a', 'We have 2', 'x1 +', 'x1 + ', 'well-known', 'the x-axis', 'Let x', '$x1 + x2', 'x1 + x2 = 4  ', 'n']) {
      expect(at(text)).toBeNull();
    }
  });
  it('reads only the line the caret is on, and only with a collapsed caret', () => {
    expect(at('first line\nx1 = 2')).toMatchObject({text: 'x1 = 2', start: 11});
    expect(typedEquationAt(padEdit('x1 = 2', 0, 6))).toBeNull();
  });
});
