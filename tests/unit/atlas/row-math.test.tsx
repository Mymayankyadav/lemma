import {describe,expect,it} from 'vitest';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Row} from '../../../src/features/atlas/Outline';
import type {AtlasNode} from '../../../src/features/atlas/tree';

describe('LOOK-4b compact Atlas mathematical names',()=>{
 for(const level of ['galaxy','system','planet','moon'] as const){
  it(`renders real KaTeX for tutor-authored ${level} names`,()=>{
   const node:AtlasNode={
    id:level,slug:level,name:String.raw`$\mathbb{R}^{n}$`,subjectId:'s',
    level,parentId:null,children:[],depth:1,synthetic:false,
    glyph:null,total:0,done:0,revisit:0,due:0,rank:0,
    status:'not_started',blurb:null,pinX:null,pinY:null,checkpointRefs:[],dueCards:0,
   };
   const markup=renderToStaticMarkup(h(Row,{
    node,open:false,tone:'none',match:false,onToggle:()=>{},onSelect:()=>{},
   }));
   const host=document.createElement('div');
   host.innerHTML=markup;
   const label=host.querySelector(`[data-level="${level}"] button span[title]`);
   expect(label).not.toBeNull();
   expect(label?.querySelector('.lemma-tex-inline .katex')).not.toBeNull();
   expect(label?.querySelector('.katex-html')?.textContent).not.toContain('mathbb');
  });
 }
});
