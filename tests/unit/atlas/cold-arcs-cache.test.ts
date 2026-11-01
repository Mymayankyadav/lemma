import {describe,expect,it} from 'vitest';
import type {AtlasGraph} from '../../../src/data/types';
import {
  budgetArcsUnfocused,budgetArcsUnfocusedCached,buildAtlasTree,
  expandedToDepth,visibleRows,
} from '../../../src/features/atlas/tree';

const subject={id:'analysis',name:'Analysis',glyph:'∫',hue:'amber' as const,position:0};
const idea=(id:string,parentId:string|null,level:'galaxy'|'planet')=>({
  id,slug:id,name:id,subjectId:'analysis',parentId,level,
  blurb:null,pinX:null,pinY:null,status:'not_started' as const,
  checkpointRefs:[],dueCards:0,
});
const graph:AtlasGraph={
  subjects:[subject],
  concepts:[
    idea('area-a',null,'galaxy'),idea('area-b',null,'galaxy'),
    idea('a1','area-a','planet'),idea('a2','area-a','planet'),
    idea('b1','area-b','planet'),idea('b2','area-b','planet'),
  ],
  links:[
    {fromId:'a1',toId:'b1',kind:'prereq'},
    {fromId:'a2',toId:'b2',kind:'prereq'},
    {fromId:'a1',toId:'b2',kind:'related'},
  ],
};

describe('FIX #647 StrictMode cold Atlas arc aggregation',()=>{
  it('reuses the exact result for a second render with identical immutable inputs',()=>{
    const tree=buildAtlasTree(graph);
    const expanded=expandedToDepth(tree,2);
    const rows=visibleRows(tree,expanded);
    const kinds=new Set<'prereq'|'related'>(['prereq']);
    const first=budgetArcsUnfocusedCached(tree,rows,expanded,kinds);
    expect(first).toEqual(budgetArcsUnfocused(tree,rows,expanded,kinds));
    expect(budgetArcsUnfocusedCached(tree,rows,expanded,kinds)).toBe(first);
  });

  it('invalidates for changed kind membership, folds, rows or tree snapshots',()=>{
    const tree=buildAtlasTree(graph);
    const expanded=expandedToDepth(tree,2);
    const rows=visibleRows(tree,expanded);
    const kinds=new Set<'prereq'|'related'>(['prereq']);
    const first=budgetArcsUnfocusedCached(tree,rows,expanded,kinds);
    kinds.add('related');
    const related=budgetArcsUnfocusedCached(tree,rows,expanded,kinds);
    expect(related).not.toBe(first);
    expect(related).toEqual(budgetArcsUnfocused(tree,rows,expanded,kinds));
    kinds.delete('related');
    expect(budgetArcsUnfocusedCached(tree,rows,expanded,kinds))
      .toEqual(budgetArcsUnfocused(tree,rows,expanded,kinds));

    // The same row array can be passed with a mutated fold Set. The cache
    // must observe folded branch membership rather than only Set identity.
    expanded.delete('area-a');
    const folded=budgetArcsUnfocusedCached(tree,rows,expanded,kinds);
    expect(folded).not.toBe(related);
    expect(folded).toEqual(budgetArcsUnfocused(tree,rows,expanded,kinds));

    const newRows=visibleRows(tree,expanded);
    expect(budgetArcsUnfocusedCached(tree,newRows,expanded,kinds))
      .toEqual(budgetArcsUnfocused(tree,newRows,expanded,kinds));

    const fresh=buildAtlasTree({...graph,concepts:graph.concepts.map(c=>({...c}))});
    expect(budgetArcsUnfocusedCached(fresh,rows,expanded,kinds))
      .toEqual(budgetArcsUnfocused(fresh,rows,expanded,kinds));
  });
});
