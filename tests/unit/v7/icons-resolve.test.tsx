import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {searchActionIcon,searchActionIds,searchGroupIcon} from '../../../src/app/v7/searchIcons';
import {groupOrder} from '../../../src/app/v7/searchModel';
import {marks} from '../../../src/ui/v7/marks';

/** Release plan R0 · F08: every icon key resolves to a component that draws something (no black-box glyphs). */
describe('v7 icon keys resolve',()=>{
 const draws=(component:unknown)=>{
  expect(typeof component==='function'||typeof component==='object').toBe(true);
  const html=renderToStaticMarkup(createElement(component as never));
  expect(html).toMatch(/^<svg/);
  expect(html).toMatch(/<(path|circle|rect|line|polyline|polygon)\b/);
  expect(html).not.toContain('∎');
 };
 it('search groups',()=>{for(const group of groupOrder)draws(searchGroupIcon[group]);});
 it('search actions',()=>{for(const id of searchActionIds)draws(searchActionIcon[id]);});
 it('drawn marks',()=>{for(const mark of Object.values(marks))draws(mark);});
});
