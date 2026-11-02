import {describe,expect,it} from 'vitest'
import type {AtlasNode,AtlasTree} from '../../../src/features/atlas/tree'
import {coldAtlasRows,coldAtlasGeometry} from '../../../src/features/atlas/coldCache'

const node=(id:string,level:AtlasNode['level'],depth:number,parentId:string|null,children:string[]):AtlasNode=>
 ({id,level,depth,parentId,children} as AtlasNode)
const makeTree=():AtlasTree=>({
 roots:['field'],
 nodes:new Map([
  ['field',node('field','cluster',0,null,['area'])],
  ['area',node('area','galaxy',1,'field',['idea'])],
  ['idea',node('idea','planet',2,'area',[])],
 ]),
 links:[],
})

describe('FIX #647 cold Atlas StrictMode derived work',()=>{
 it('reuses immutable open-set rows across duplicate render calculations',()=>{
  const tree=makeTree(),open=new Set(['field','area'])
  const first=coldAtlasRows(tree,open)
  expect(first.map(row=>row.id)).toEqual(['field','area','idea'])
  expect(coldAtlasRows(tree,open)).toBe(first)
  // A new Set is how Page updates fold state; never reuse stale rows.
  const folded=coldAtlasRows(tree,new Set<string>())
  expect(folded.map(row=>row.id)).toEqual(['field'])
  expect(folded).not.toBe(first)
  expect(coldAtlasRows(tree,new Set(['field'])).map(row=>row.id)).toEqual(['field','area'])
 })
 it('caches virtual row geometry by stable row-array identity',()=>{
  const tree=makeTree(),open=new Set(['field','area'])
  const rows=coldAtlasRows(tree,open)
  const geometry=coldAtlasGeometry(tree,rows)
  expect(geometry.offsets).toEqual([0,64,116,160])
  expect(geometry.totalHeight).toBe(160)
  expect(coldAtlasGeometry(tree,rows)).toBe(geometry)
  const otherTree=makeTree()
  expect(coldAtlasGeometry(otherTree,rows)).not.toBe(geometry)
 })
 it('does not reuse filtered rows or a different tree with the same open Set',()=>{
  const tree=makeTree(),open=new Set(['field','area'])
  const first=coldAtlasRows(tree,open)
  const filtered=coldAtlasRows(tree,open,n=>n.id==='idea')
  expect(filtered.map(row=>row.id)).toEqual(['field','area','idea'])
  expect(filtered).not.toBe(first)
  expect(coldAtlasRows(makeTree(),open)).not.toBe(first)
 })
})
