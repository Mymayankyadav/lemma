import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fetchNotificationReviewItems} from '../../../src/data/notify';

const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({rpc})}));

describe('reminder owner-scoped RPC',()=>{
 beforeEach(()=>rpc.mockReset());

 it('makes exactly one bounded RPC read with no caller-supplied owner',async()=>{
  rpc.mockResolvedValue({data:[{cardId:'one'},{cardId:'two'},{cardId:'two'}],error:null});
  const items=await fetchNotificationReviewItems(2);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('notification_review_items',{
   p_count:2,p_decks:[],p_session_id:null,p_concept_slug:null,
   p_include_new:true,p_new_only:false,
  });
  expect(Object.keys(rpc.mock.calls[0][1])).not.toContain('p_user_id');
  expect(items.map(item=>item.cardId)).toEqual(['one','two']);
 });

 it('rejects invalid counts before contacting the owner-scoped RPC',async()=>{
  await expect(fetchNotificationReviewItems(51)).rejects.toThrow(RangeError);
  await expect(fetchNotificationReviewItems(0)).rejects.toThrow(RangeError);
  expect(rpc).not.toHaveBeenCalled();
 });

 it('does not fall back to ordinary review items after a failed RPC',async()=>{
  rpc.mockResolvedValue({data:null,error:new Error('session expired')});
  await expect(fetchNotificationReviewItems(3)).rejects.toThrow('session expired');
  expect(rpc).toHaveBeenCalledTimes(1);
 });

 it('rejects malformed RPC data instead of opening an unbounded round',async()=>{
  rpc.mockResolvedValue({data:{items:[]},error:null});
  await expect(fetchNotificationReviewItems(3)).rejects.toThrow('Invalid reminder queue response');
 });
});
