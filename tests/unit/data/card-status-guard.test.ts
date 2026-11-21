import {beforeEach,describe,expect,it,vi} from 'vitest';
import {authGeneration,publishAuth} from '../../../src/data/authBoundary';
import {LiveAdapter} from '../../../src/data/live/adapter';
import type {NoteStatusGuard} from '../../../src/data/api';

const fixture=vi.hoisted(()=>{
 const getUser=vi.fn();
 const query={update:vi.fn(),eq:vi.fn(),select:vi.fn(),single:vi.fn()};
 query.update.mockReturnValue(query);
 query.eq.mockReturnValue(query);
 query.select.mockReturnValue(query);
 return {getUser,query,from:vi.fn(()=>query)};
});
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({from:fixture.from,auth:{getUser:fixture.getUser}}),
}));

describe('guarded card status writes',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  publishAuth({id:'owner-a'});
  fixture.getUser.mockResolvedValue({data:{user:{id:'owner-a'}},error:null});
  fixture.query.single.mockResolvedValue({data:{id:'note-id'},error:null});
 });

 const undoGuard=():NoteStatusGuard=>({
  noteId:'note-id',ownerId:'owner-a',generation:authGeneration(),expectedStatus:'deleted',
 });

 it('restores the old status only on the captured note that is still deleted',async()=>{
  await new LiveAdapter().setNoteStatus(42,'suspended',undoGuard());
  expect(fixture.from).toHaveBeenCalledWith('notes');
  expect(fixture.query.update).toHaveBeenCalledWith({status:'suspended'});
  expect(fixture.query.eq.mock.calls).toEqual([
   ['no',42],['user_id','owner-a'],['id','note-id'],['status','deleted'],
  ]);
  expect(fixture.query.single).toHaveBeenCalledOnce();
 });

 it('rejects a stale Undo before starting auth lookup',async()=>{
  const guard=undoGuard();
  publishAuth({id:'owner-b'});
  await expect(new LiveAdapter().setNoteStatus(42,'active',guard)).rejects.toMatchObject({code:'auth'});
  expect(fixture.getUser).not.toHaveBeenCalled();
  expect(fixture.from).not.toHaveBeenCalled();
 });

 it.each(['owner-a','owner-b'])('rejects a switched account during auth lookup even if the verified user is %s',async verified=>{
  let verify!:(result:{data:{user:{id:string}};error:null})=>void;
  fixture.getUser.mockImplementationOnce(()=>new Promise(resolve=>{verify=resolve;}));
  const undo=new LiveAdapter().setNoteStatus(42,'active',undoGuard());
  expect(fixture.getUser).toHaveBeenCalledOnce();
  publishAuth({id:'owner-b'});
  if(verified==='owner-a')publishAuth({id:'owner-a'});
  verify({data:{user:{id:verified}},error:null});
  await expect(undo).rejects.toMatchObject({code:'auth'});
  expect(fixture.from).not.toHaveBeenCalled();
 });
});
