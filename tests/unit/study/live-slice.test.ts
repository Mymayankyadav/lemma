import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveStudyApi} from '../../../src/data/study/live';
import {liveClient} from '../../../src/data/live/client';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));

const ok=(id:string,version:number,actionNo:number)=>({
  data:{status:'ok',changed:[{id,version}],actionNo},error:null
});
const conflict=(version:number)=>({
  data:{status:'conflict',changed:[],actionNo:null,conflict:{currentVersion:version}},error:null
});
const dbError=(message:string)=>({data:null,error:{code:'P0001',message}});

type RpcResponse=ReturnType<typeof ok>|ReturnType<typeof conflict>|ReturnType<typeof dbError>;
const targetId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let rpc:ReturnType<typeof vi.fn>;
function configure(responses:RpcResponse[]){
  const queue=[...responses];
  rpc=vi.fn(async()=>queue.shift()??dbError('unexpected extra command'));
  vi.mocked(liveClient).mockReturnValue({rpc} as never);
}
beforeEach(()=>vi.clearAllMocks());

describe('N35.1 live study start is reversible across the two RPCs',()=>{
  it('removes only its own draft when starting races with an active session',async()=>{
    configure([ok(targetId,1,12),conflict(7),ok(targetId,2,13)]);
    const api=createLiveStudyApi();
    await expect(api.startStudyEntry({source:'timer',intent:'Proof'})).rejects.toMatchObject({
      code:'conflict'
    });
    expect(rpc).toHaveBeenCalledTimes(3);
    const envelopes=rpc.mock.calls.map(([,args])=>args.p);
    expect(envelopes.map((p:{operation:string})=>p.operation)).toEqual(['create','start','delete']);
    expect(envelopes[2]).toMatchObject({
      schemaVersion:1,resource:'study_entries',operation:'delete',
      target:{id:targetId},expectedVersion:1,patch:{}
    });
    expect(envelopes[2]).not.toHaveProperty('user_id');
    expect(envelopes[2]).not.toHaveProperty('userId');
    expect(new Set(envelopes.map((p:{operationId:string})=>p.operationId)).size).toBe(3);
  });
  it('retains the start failure when cleanup itself conflicts or fails',async()=>{
    configure([ok(targetId,1,12),dbError('Invalid start transition'),conflict(2)]);
    await expect(createLiveStudyApi().startStudyEntry({
      source:'timer',intent:'Proof'
    })).rejects.toMatchObject({code:'invalid',message:'Invalid start transition'});
    expect(rpc.mock.calls.map(([,args])=>args.p.operation)).toEqual(['create','start','delete']);
  });
  it('does not modify a terminal or unrelated record; cleanup is version-guarded',async()=>{
    configure([ok(targetId,1,12),dbError('already active'),dbError('Study version changed elsewhere')]);
    await expect(createLiveStudyApi().startStudyEntry({
      source:'timer',intent:'Proof'
    })).rejects.toMatchObject({code:'conflict'});
    const cleanup=rpc.mock.calls[2][1].p;
    expect(cleanup.target).toEqual({id:targetId});
    expect(cleanup.expectedVersion).toBe(1);
    expect(cleanup.patch).toEqual({});
  });
});
