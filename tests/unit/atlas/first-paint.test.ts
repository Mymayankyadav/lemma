import {describe,expect,it} from 'vitest';
import {initialExpanded,visibleRows,type AtlasTree} from '../../../src/features/atlas/tree';

// FIX #519: the first render must already use the effective expanded set.
// Waiting for an effect used to construct and draw the 8,000-link Atlas twice
// on a 4× CPU-throttled mobile route transition.
const tree={
 roots:['field'],
 nodes:new Map([
  ['field',{id:'field',parentId:null,children:['idea'],status:'not_started',synthetic:true,level:'cluster'}],
  ['idea',{id:'idea',parentId:'field',children:[],status:'not_started',synthetic:false,level:'planet'}],
 ]),
 links:[],
} as unknown as AtlasTree;

describe('FIX #519 Atlas first paint',()=>{
 it('opens the default field and its first idea synchronously',()=>{
  const open=initialExpanded(tree);
  expect([...open]).toEqual(['field']);
  expect(visibleRows(tree,open).map(row=>row.id)).toEqual(['field','idea']);
 });
 it('restores valid saved folds and ignores stale idea IDs',()=>{
  expect([...initialExpanded(tree,['field','removed'])]).toEqual(['field']);
  expect([...initialExpanded(tree,['removed'])]).toEqual(['field']);
 });
});
