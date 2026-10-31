import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {LiveAdapter} from '../../../src/data/live/adapter';

describe('CONTRACT card detail cursor paging',()=>{
 it('exposes explicit not-implemented stubs until FIX-546b supplies bounded reads',async()=>{
  const demo=new DemoAdapter(),live=new LiveAdapter();
  for(const adapter of [demo,live]){
   await expect(adapter.getCardHistoryPage(1)).rejects.toMatchObject({code:'not_implemented'});
   await expect(adapter.getCardCommentsPage(1)).rejects.toMatchObject({code:'not_implemented'});
  }
 });
});
