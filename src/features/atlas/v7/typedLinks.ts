import {LINK_KINDS, type AtlasLink, type LinkKind} from '../../../../supabase/functions/_shared/adaptive/links';
import type {Star} from './model';

/**
 * N227 (Owner: "add an optional view for v3 type links and use colour coding for it, inside the filter menu"): Atlas V3's
 * typed links drawn on the map, each kind in its own colour and dash so the kinds stay apart without colour too. The
 * colours are role tokens, so Day and Night differ in value only. Subject colours are left to the constellations.
 */
export const TYPED_LINK_STYLE: Readonly<Record<LinkKind, {label: string; token: string; dash: readonly number[]}>> = {
  equivalent: {label: 'Equivalent', token: '--v7-role-selection-fg', dash: []},
  generalises: {label: 'Generalises', token: '--v7-role-status-success', dash: []},
  instance_of: {label: 'Instance of', token: '--v7-role-status-success', dash: [6, 4]},
  uses_technique: {label: 'Uses technique', token: '--v7-role-status-warning', dash: [6, 4]},
  contrasts: {label: 'Contrasts with', token: '--v7-role-status-danger', dash: [2, 4]},
  analogous: {label: 'Analogous', token: '--v7-role-selection-fg', dash: [2, 4]},
  part_of: {label: 'Part of', token: '--v7-role-text-secondary', dash: [9, 3, 2, 3]},
};
export const TYPED_LINK_KINDS = LINK_KINDS;

export type TypedEdge = Readonly<{from: number; to: number; kind: LinkKind; proposed: boolean}>;

/** The links between concepts on the map, by star index; rejected links and links to concepts not shown are left out. */
export function typedEdges(stars: readonly Pick<Star, 'id'>[], links: readonly Pick<AtlasLink, 'from_id' | 'to_id' | 'kind' | 'status'>[]): TypedEdge[] {
  const index = new Map(stars.map((star, i) => [star.id, i]));
  const seen = new Set<string>();
  return links.flatMap(link => {
    const from = index.get(link.from_id), to = index.get(link.to_id);
    if (link.status === 'rejected' || from === undefined || to === undefined || from === to || !(link.kind in TYPED_LINK_STYLE)) return [];
    const key = link.kind + ':' + Math.min(from, to) + ':' + Math.max(from, to);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{from, to, kind: link.kind, proposed: link.status !== 'approved'}];
  });
}

/** How many links of each kind the view would draw, for the key. */
export function typedLinkCounts(edges: readonly TypedEdge[]) {
  const counts = new Map<LinkKind, number>();
  for (const edge of edges) counts.set(edge.kind, (counts.get(edge.kind) ?? 0) + 1);
  return counts;
}
