import {describe,expect,it} from 'vitest';
import {transformedPaperPoint} from '../../../src/ui/v7/ink/ink';

describe('full-screen and landscape writing coordinates',()=>{
  it('reads a normal paper at 2× CSS scale',()=>{
    expect(transformedPaperPoint(210,180,{a:2,b:0,c:0,d:2,e:10,f:20})).toEqual({x:100,y:80});
  });
  it('undoes a clockwise 90-degree rotation before saving or model recognition',()=>{
    // x_screen = 400 - y_paper, y_screen = x_paper.
    expect(transformedPaperPoint(320,120,{a:0,b:1,c:-1,d:0,e:400,f:0})).toEqual({x:120,y:80});
  });
  it('clamps outside positions and rejects noninvertible transforms',()=>{
    expect(transformedPaperPoint(-99,999,{a:1,b:0,c:0,d:1,e:0,f:0})).toEqual({x:0,y:400});
    expect(transformedPaperPoint(20,50,{a:0,b:0,c:0,d:0,e:0,f:0})).toBeNull();
  });
});
