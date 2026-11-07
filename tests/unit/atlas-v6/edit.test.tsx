import {describe,expect,it} from 'vitest';
import {checkAtlasLink,describeAtlasMergeImpact,type AtlasEditNode}
 from '../../../src/features/atlas/v6/impact';
const nodes:AtlasEditNode[]=[
 {id:'a',parentId:null,prerequisiteIds:[]},
 {id:'b',parentId:'a',prerequisiteIds:['a']},
 {id:'c',parentId:'b',prerequisiteIds:['b']},
 {id:'d',parentId:null,prerequisiteIds:[]},
];
describe('N86 Atlas editor safety and merge impact',()=>{
 it('rejects self links and parent cycles with a reason',()=>{
  expect(checkAtlasLink(nodes,'a','a','parent')).toEqual({ok:false,reason:expect.any(String)});
  expect(checkAtlasLink(nodes,'a','c','parent')).toMatchObject({ok:false});
  expect(checkAtlasLink(nodes,'d','a','parent')).toEqual({ok:true});
 });
 it('checks prerequisite cycles independently of the parent tree',()=>{
  expect(checkAtlasLink(nodes,'a','c','prerequisite')).toMatchObject({ok:false});
  expect(checkAtlasLink(nodes,'c','d','prerequisite')).toEqual({ok:true});
  expect(checkAtlasLink(nodes,'c','missing','prerequisite')).toMatchObject({ok:false});
 });
 it('offers an explicit, non-destructive impact count before merging',()=>{
  expect(describeAtlasMergeImpact(nodes,'b','d',[{leftId:'b',rightId:'c'}]))
   .toEqual({childConcepts:1,incomingPrerequisites:1,
    outgoingPrerequisites:1,relatedConcepts:1});
  expect(()=>describeAtlasMergeImpact(nodes,'a','a')).toThrow();
  expect(nodes[1].parentId).toBe('a');
 });
});
