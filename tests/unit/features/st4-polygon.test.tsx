import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PolygonProgress} from '../../../src/features/review-run/PolygonProgress';

const order=(count:number)=>Array.from({length:count},(_,i)=>'card-'+i);
const answer=(cardId:string,rating:number)=>({card:{cardId},rating});

describe('ST-4 round progress at scale',()=>{
 it('keeps the polygon for a 24-card round',()=>{
  const html=renderToStaticMarkup(PolygonProgress({
   total:24,order:order(24),currentCardId:'card-0',answers:[answer('card-0',1)],
  }));
  expect((html.match(/data-review-edge=/g)||[])).toHaveLength(24);
  expect(html).toContain('data-review-edge="missed"');
  expect(html).not.toContain('data-review-segment=');
 });
 it('renders a bounded 12-arc ring for a 400-card round',()=>{
  const ids=order(400);
  const answers=[...ids.slice(0,240).map(id=>answer(id,3)),answer(ids[0],1)];
  const html=renderToStaticMarkup(PolygonProgress({
   total:400,order:ids,currentCardId:ids[240],answers,
  }));
  expect((html.match(/data-review-segment="pending"/g)||[])).toHaveLength(12);
  expect((html.match(/data-review-segment="filled"/g)||[])).toHaveLength(8);
  expect(html).toContain('240 of 400 reviewed, missed 1');
  expect(html).toContain('240 / 400');
  expect(html).not.toContain('data-review-edge=');
 });
 it('keeps a previously missed card counted until its successful recheck',()=>{
  const ids=order(150);
  const missed=renderToStaticMarkup(PolygonProgress({
   total:150,order:ids,currentCardId:ids[2],answers:[answer(ids[0],1),answer(ids[1],3)],
  }));
  expect(missed).toContain('missed 1');
  const corrected=renderToStaticMarkup(PolygonProgress({
   total:150,order:ids,currentCardId:ids[2],answers:[
    answer(ids[0],1),answer(ids[1],3),answer(ids[0],3),
   ],
  }));
  expect(corrected).toContain('missed 0');
  expect(corrected).toContain('2 of 150 reviewed');
 });
});
