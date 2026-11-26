import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {emblemKind,emblemHash,emblemStrokes,emblemTier,TIER_LIMIT,TIER_WIDTH,type EmblemTier} from '../../../src/ui/v7/emblem';

const families=['Analysis','Algebra','Topology','Number theory','Geometry','Logic','Probability','Combinatorics','Other'];
const tiers:EmblemTier[]=['hero','tile','glyph'];

describe('v7 mathematical emblems (warm-theme draft)',()=>{
 it('selects one mathematical family per subject',()=>{
  expect(emblemKind('Real Analysis')).toBe('radial-wave');
  expect(emblemKind('Linear Algebra')).toBe('icosahedron');
  expect(emblemKind('Topology')).toBe('torus-knot');
  expect(emblemKind('Number theory')).toBe('multiplication-circle');
  expect(emblemKind('Logic')).toBe('hasse');
  expect(emblemKind('Geometry')).toBe('euclid');
  expect(emblemKind('Probability')).toBe('markov');
  expect(emblemKind('Combinatorics')).toBe('complete-graph');
  expect(emblemKind('Other')).toBe('rose');
 });
 it('picks the tier from the rendered size',()=>{
  expect(emblemTier(520)).toBe('hero');expect(emblemTier(164)).toBe('hero');
  expect(emblemTier(96)).toBe('tile');expect(emblemTier(48)).toBe('tile');
  expect(emblemTier(24)).toBe('glyph');expect(emblemTier(16)).toBe('glyph');
 });
 it('keeps every family within its tier budget, with exactly one focal stroke at hero and tile',()=>{
  for(const subject of families)for(const tier of tiers)for(const seed of ['a','b','path-123','x9']){
   const strokes=emblemStrokes(subject,seed,undefined,tier);
   expect(strokes.length,subject+' '+tier).toBeGreaterThan(0);
   expect(strokes.length,subject+' '+tier).toBeLessThanOrEqual(TIER_LIMIT[tier]);
   if(tier==='glyph')expect(strokes.length).toBeGreaterThanOrEqual(1);
   const focal=strokes.filter(s=>s.focal);
   if(tier!=='glyph')expect(focal.length,subject+' '+tier).toBe(1);
   expect(JSON.stringify(strokes)).not.toMatch(/NaN|Infinity/);
  }
 });
 it('uses the same 1.75px stroke for every family, with helpers at exactly 50%',()=>{
  for(const subject of families)for(const tier of ['hero','tile'] as const){
   for(const stroke of emblemStrokes(subject,'seed',undefined,tier)){
    if(stroke.focal){expect(stroke.width).toBe(TIER_WIDTH[tier].focal);expect(stroke.opacity).toBe(1);}
    else{expect(stroke.width).toBe(TIER_WIDTH[tier].base);expect(stroke.opacity).toBe(.5);}
   }
  }
  for(const tier of tiers){
   expect(TIER_WIDTH[tier]).toEqual({base:1.75,focal:1.75});
   for(const subject of families)for(const stroke of emblemStrokes(subject,'seed',undefined,tier))expect(stroke.width).toBe(1.75);
  }
 });
 it('draws Topology as a single knot line without duplicate tube outlines',()=>{
  for(const tier of tiers)for(const seed of ['a','b','path-123']){
   const strokes=emblemStrokes('Topology',seed,undefined,tier);
   expect(strokes).toHaveLength(1);
   expect(strokes[0]).toMatchObject({focal:true,width:1.75,opacity:1});
  }
 });
 it('varies parameters within a family by seed, never the family, and is deterministic',()=>{
  expect(emblemHash('path-a')).not.toBe(emblemHash('path-b'));
  for(const subject of families){
   expect(emblemStrokes(subject,'path-a')).toEqual(emblemStrokes(subject,'path-a'));
   const seeds=['p1','p2','p3','p4','p5','p6','p7','p8'].map(s=>JSON.stringify(emblemStrokes(subject,s)));
   expect(new Set(seeds).size,subject).toBeGreaterThan(1);
  }
 });
 it('matches the deterministic family × tier construction (SVG strings)',()=>{
  const digest:Record<string,string>={};
  for(const subject of families)for(const tier of tiers){
   const strokes=emblemStrokes(subject,'snapshot-seed',undefined,tier);
   digest[subject+' · '+tier]=strokes.length+' strokes · '+emblemHash(JSON.stringify(strokes)).toString(16);
  }
  expect(digest).toMatchSnapshot();
 });
 it('keeps the focal stroke at 3:1 or more on its page and tile background in Day and Night',()=>{
  const css=readFileSync('src/ui/v7/tokens.css','utf8');
  const blocks=css.split(/\n\}/).filter(b=>b.includes('--v7-role-subject-analysis:'));
  expect(blocks.length).toBeGreaterThanOrEqual(2);
  const hex=(h:string)=>[1,3,5].map(k=>parseInt(h.slice(k,k+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);
  const lum=(h:string)=>{const [r,g,b]=hex(h);return .2126*r+.7152*g+.0722*b;};
  const ratio=(a:string,b:string)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
  for(const block of blocks){
   const get=(name:string)=>new RegExp('--v7-role-'+name+':\\s*(#[0-9A-Fa-f]{6})').exec(block)?.[1];
   const page=get('surface-page')!;
   for(const s of ['analysis','topology','logic','number-theory','algebra','combinatorics','geometry','probability']){
    const ink=get('subject-'+s)!,subtle=get('subject-'+s+'-subtle')!;
    expect(ratio(ink,page),s+' on page').toBeGreaterThanOrEqual(3);
    expect(ratio(ink,subtle),s+' on its tile').toBeGreaterThanOrEqual(3);
   }
  }
 });
});
