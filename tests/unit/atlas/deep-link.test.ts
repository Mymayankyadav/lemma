import {describe,it,expect} from 'vitest';
import {resolveAtlasDeepLink} from '../../../src/features/atlas/deep-link';

const name=String.raw`Uniform $\ell^p$ convergence`;
const nodes=[
 {id:'first',slug:'uniform-continuity',name,subjectId:'analysis',synthetic:false},
 {id:'second',slug:'uniform-continuity',name,subjectId:'functional-analysis',synthetic:false},
 {id:'third',slug:'compactness',name:'Compactness',subjectId:'topology',synthetic:false},
];

describe('Atlas deep-link identity',()=>{
 it('never guesses the first subject when mathematical names and stored slugs collide',()=>{
  expect(resolveAtlasDeepLink(nodes,{id:null,slug:'uniform-l-p-convergence',name}))
   .toEqual({kind:'ambiguous',ids:['first','second']});
  expect(resolveAtlasDeepLink(nodes,{id:null,slug:'uniform-continuity',name}))
   .toEqual({kind:'ambiguous',ids:['first','second']});
  expect(resolveAtlasDeepLink(nodes,{id:null,slug:'uniform-continuity',name:null}))
   .toEqual({kind:'ambiguous',ids:['first','second']});
 });
 it('resolves a stable concept ID to the intended subject even with duplicate names',()=>{
  expect(resolveAtlasDeepLink(nodes,{id:'second',slug:'uniform-continuity',name}))
   .toEqual({kind:'found',id:'second'});
  expect(resolveAtlasDeepLink(nodes,{id:'missing',slug:'uniform-continuity',name}))
   .toEqual({kind:'missing'});
 });
 it('does not let a mismatched name select an unrelated slug',()=>{
  expect(resolveAtlasDeepLink(nodes,{id:null,slug:'compactness',name}))
   .toEqual({kind:'ambiguous',ids:['first','second']});
  expect(resolveAtlasDeepLink(nodes,{id:null,slug:'compactness',name:'Unknown'}))
   .toEqual({kind:'missing'});
  expect(resolveAtlasDeepLink(nodes,{id:null,slug:'compactness',name:null}))
   .toEqual({kind:'found',id:'third'});
 });
 it('does not trust a derived slug even when it happens to match the wrong subject',()=>{
  const withDifferentSlugs=[
   {...nodes[0],slug:'uniform-l-p-convergence'},
   {...nodes[1],slug:'stored-functional-analysis-slug'},
  ];
  expect(resolveAtlasDeepLink(withDifferentSlugs,{id:null,slug:'uniform-l-p-convergence',name}))
   .toEqual({kind:'ambiguous',ids:['first','second']});
  expect(resolveAtlasDeepLink(withDifferentSlugs,{id:'second',slug:'uniform-l-p-convergence',name}))
   .toEqual({kind:'found',id:'second'});
 });
});
