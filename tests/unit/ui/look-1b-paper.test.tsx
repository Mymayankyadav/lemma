import {describe,expect,it} from 'vitest';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Card} from '../../../src/ui/Card';
import {Slab} from '../../../src/ui/Slab';
import {Tile} from '../../../src/ui/Tile';

const mount=(element:ReturnType<typeof h>)=>{
 const host=document.createElement('div');
 host.innerHTML=renderToStaticMarkup(element);
 return host;
};

describe('LOOK-1b one paper layer',()=>{
 it('retains the paper class for independent top-level surfaces',()=>{
  const host=mount(h('div',null,
   h(Card,null,'Card'),h(Slab,null,'Slab'),h(Tile,null,'Tile')));
  expect(host.querySelectorAll('.card')).toHaveLength(1);
  expect(host.querySelectorAll('.slab')).toHaveLength(1);
  expect(host.querySelectorAll('.tile')).toHaveLength(1);
 });
 it('flattens nested Card, Slab and Tile without losing semantic content',()=>{
  const host=mount(h(Card,{as:'article','aria-label':'Outer paper'},
   h(Slab,{as:'section','aria-label':'First group'},
    h(Tile,{as:'article','aria-label':'Second group'},
     h(Card,{as:'section','aria-label':'Third group'},'Mathematical content')))));
  const outer=host.querySelector('.card');
  expect(outer).not.toBeNull();
  expect(outer?.querySelector('.card,.slab,.tile')).toBeNull();
  expect(host.querySelectorAll('[data-card]')).toHaveLength(1);
  expect(outer?.querySelectorAll('[data-paper-group]')).toHaveLength(3);
  expect(host.querySelector('article[aria-label="Outer paper"]')).not.toBeNull();
  expect(host.querySelector('section[aria-label="First group"]')).not.toBeNull();
  expect(host.textContent).toContain('Mathematical content');
 });
 it('flattens mixed nesting regardless of the outer primitive',()=>{
  for(const Parent of [Slab,Tile]){
   const host=mount(h(Parent,null,h(Card,null,h(Tile,null,'Inner'))));
   expect(host.querySelectorAll('.card,.slab,.tile')).toHaveLength(1);
   expect(host.querySelectorAll('[data-paper-group]')).toHaveLength(2);
  }
 });
});
