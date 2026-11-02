import type {AtlasNode,AtlasTree,Row} from './tree'
import {visibleRows} from './tree'
import {buildAtlasRowGeometry} from './rowGeometry'
import type {AtlasRowGeometry} from './rowGeometry'

// The Atlas Page treats fold Sets as immutable: every toggle creates a new Set.
// React StrictMode can evaluate a useMemo calculation twice for the *same*
// fold Set. Reuse the row-array identity so its 2,500-row geometry and the
// existing row-keyed 8,000-link arc budget are not recalculated on first paint.
// Weak keys avoid retaining abandoned fold states and derived rows.
const rowsByOpen=new WeakMap<ReadonlySet<string>,{tree:AtlasTree;rows:Row[]}>()

export function coldAtlasRows(
 tree:AtlasTree,expanded:ReadonlySet<string>,filter?:(node:AtlasNode)=>boolean,
):Row[]{
 // Search/re-check filters can change independently of the fold Set; always
 // compute them from the current predicate, never reuse an unfiltered result.
 if(filter)return visibleRows(tree,expanded,filter)
 const previous=rowsByOpen.get(expanded)
 if(previous?.tree===tree)return previous.rows
 const rows=visibleRows(tree,expanded)
 rowsByOpen.set(expanded,{tree,rows})
 return rows
}

// The geometry is a pure function of the immutable row array and its tree's
// levels. Sharing it across duplicate StrictMode calculations avoids a second
// offset/center pass without changing windowing, keyboard or gutter positions.
const geometryByRows=new WeakMap<readonly Row[],{tree:AtlasTree;geometry:AtlasRowGeometry}>()

export function coldAtlasGeometry(tree:AtlasTree,rows:readonly Row[]):AtlasRowGeometry{
 const previous=geometryByRows.get(rows)
 if(previous?.tree===tree)return previous.geometry
 const geometry=buildAtlasRowGeometry(rows.map(row=>tree.nodes.get(row.id)?.level??'planet'))
 geometryByRows.set(rows,{tree,geometry})
 return geometry
}
