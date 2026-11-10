import {describe,it,expect} from 'vitest';
import {focusStatus} from '../../../src/lib/focus/status';
describe('N121 one focus status across surfaces',()=>{
 it('gives paused precedence over an active break',()=>{
  expect(focusStatus('paused','break')).toBe('Paused · break');
  expect(focusStatus('paused','long_break')).toBe('Paused · long break');
  expect(focusStatus('paused','focus')).toBe('Paused');
 });
 it('agrees on labels for running, breaks and finishing',()=>{
  expect(focusStatus('running','focus')).toBe('In focus');
  expect(focusStatus('running','break')).toBe('On a break');
  expect(focusStatus('break','focus')).toBe('On a break');
  expect(focusStatus('running','long_break')).toBe('Long break');
  expect(focusStatus('finishing','break')).toBe('Ready to save');
 });
});
