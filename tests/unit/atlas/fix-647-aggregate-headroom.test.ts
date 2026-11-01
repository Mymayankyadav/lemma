import {describe,expect,it} from 'vitest';
import type {AtlasGraph} from '../../../src/data/types';
import {buildAtlasTree,defaultExpanded,visibleRows} from '../../../src/features/atlas/tree';

// FIX #647: the existing strict no-retry C2 test fails on current main at
// 360px. This large semantic guard ensures a faster first-mount aggregation
// does not drop due cards, status propagation, prerequisites or open paths.
describe('FIX #647 cold Atlas aggregation semantics',()=>{
 it('preserves every count, propagated status and default open ancestor in a large outline',()=>{
  const concepts:AtlasGraph['concepts']=[
   {id:'field',slug:'field',name:'Analysis',subjectId:'s',level:'cluster',parentId:null,
    status:'not_started',blurb:null,pinX:null,pinY:null,checkpointRefs:[],dueCards:0},
   {id:'area',slug:'area',name:'Topology',subjectId:'s',level:'galaxy',parentId:'field',
    status:'not_started',blurb:null,pinX:null,pinY:null,checkpointRefs:[],dueCards:0},
   {id:'topic',slug:'topic',name:'Compactness',subjectId:'s',level:'system',parentId:'area',
    status:'not_started',blurb:null,pinX:null,pinY:null,checkpointRefs:[],dueCards:0},
  ];
  for(let i=0;i<600;i++)concepts.push({
   id:'idea-'+i,slug:'idea-'+i,name:'Idea '+String(i).padStart(3,'0'),subjectId:'s',
   level:'planet',parentId:'topic',status:i%5===0?'revisit':i%3===0?'demonstrated':'not_started',
   blurb:null,pinX:null,pinY:null,checkpointRefs:[],dueCards:i%4,
  });
  const graph:AtlasGraph={
   subjects:[{id:'s',name:'Analysis',glyph:'A',hue:'amber',position:0}],
   concepts,links:Array.from({length:599},(_,i)=>({
    fromId:'idea-'+i,toId:'idea-'+(i+1),kind:'prereq' as const,
   })),
  };
  const tree=buildAtlasTree(graph);
  const demonstrated=Array.from({length:600},(_,i)=>i).filter(i=>i%5!==0&&i%3===0).length;
  const due=Array.from({length:600},(_,i)=>i%4).reduce((a,b)=>a+b,0);
  for(const id of ['field','area','topic']){
   const node=tree.nodes.get(id)!;
   expect(node.total).toBe(600);
   expect(node.done).toBe(demonstrated);
   expect(node.revisit).toBe(120);
   expect(node.due).toBe(due);
   expect(node.status).toBe('revisit');
  }
  expect(tree.nodes.get('topic')!.children).toHaveLength(600);
  expect(defaultExpanded(tree)).toEqual(new Set(['field','area','topic']));
  expect(visibleRows(tree,defaultExpanded(tree)).length).toBe(603);
  expect(buildAtlasTree(graph)).toBe(tree);
 });
});
