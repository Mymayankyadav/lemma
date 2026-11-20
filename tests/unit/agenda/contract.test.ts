import { describe, expect, it } from 'vitest';
import { requestedAlgorithm } from '../../../supabase/functions/_shared/agenda/contract';

describe('owner scheduling choice', () => {
  it.each([
    [null, false, 'legacy'], ['new', false, 'legacy'],
    [null, true, 'new'], [undefined, true, 'new'], ['new', true, 'new'],
    ['legacy', true, 'legacy'], ['unknown', true, 'legacy'],
  ] as const)('resolves %s at release state %s', (setting, released, expected) => {
    expect(requestedAlgorithm(setting, released)).toBe(expected);
  });
});
