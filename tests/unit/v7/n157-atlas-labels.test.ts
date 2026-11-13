import {expect,it} from 'vitest';
import {roomLabelSpot,type LabelBox} from '../../../src/features/atlas/v7/roomLabels';

it('keeps every label of a dense phone constellation readable within the visible bounds',()=>{
 const bounds={x:8,y:120,width:374,height:570},occupied:LabelBox[]=[];
 for(let i=0;i<32;i++){
  const width=90+(i%4)*20,height=14;
  const spot=roomLabelSpot([[112,400],[80-width,400]],width,height,bounds,occupied);
  expect(spot,'concept '+i).not.toBeNull();
  const [x,y]=spot!;
  expect(x).toBeGreaterThanOrEqual(bounds.x);expect(x+width).toBeLessThanOrEqual(bounds.x+bounds.width);
  expect(y).toBeGreaterThanOrEqual(bounds.y);expect(y+height).toBeLessThanOrEqual(bounds.y+bounds.height);
  for(const box of occupied)expect(x<box.x+box.width&&x+width>box.x&&y<box.y+box.height&&y+height>box.y).toBe(false);
  occupied.push({x,y,width,height});
 }
});
