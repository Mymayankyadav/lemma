import {describe, expect, it} from 'vitest';
import {LINK_KINDS} from '../../../supabase/functions/_shared/adaptive/links';
import {TYPED_LINK_STYLE, typedEdges, typedLinkCounts} from '../../../src/features/atlas/v7/typedLinks';

// N227 (Owner): Atlas V3's typed links as an optional, colour-coded map view.
describe('Atlas typed links', () => {
  const stars = [{id: 'a'}, {id: 'b'}, {id: 'c'}];
  it('maps links to stars, keeps proposed ones marked, and leaves out rejected, unknown, self and repeated links', () => {
    const edges = typedEdges(stars, [
      {from_id: 'a', to_id: 'b', kind: 'analogous', status: 'proposed'},
      {from_id: 'b', to_id: 'a', kind: 'analogous', status: 'approved'},
      {from_id: 'b', to_id: 'c', kind: 'generalises', status: 'approved'},
      {from_id: 'a', to_id: 'c', kind: 'contrasts', status: 'rejected'},
      {from_id: 'a', to_id: 'zzz', kind: 'part_of', status: 'approved'},
      {from_id: 'c', to_id: 'c', kind: 'equivalent', status: 'approved'},
    ]);
    expect(edges).toEqual([
      {from: 0, to: 1, kind: 'analogous', proposed: true},
      {from: 1, to: 2, kind: 'generalises', proposed: false},
    ]);
    expect([...typedLinkCounts(edges)]).toEqual([['analogous', 1], ['generalises', 1]]);
  });
  it('gives every V3 link kind a label, a colour token and a dash that tell it apart', () => {
    for (const kind of LINK_KINDS) expect(TYPED_LINK_STYLE[kind].token).toMatch(/^--v7-role-/);
    const looks = LINK_KINDS.map(kind => TYPED_LINK_STYLE[kind].token + '|' + TYPED_LINK_STYLE[kind].dash.join(','));
    expect(new Set(looks).size).toBe(LINK_KINDS.length);
  });
});
