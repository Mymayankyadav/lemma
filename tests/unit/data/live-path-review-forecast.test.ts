// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url',()=>({default:'unused-worker'}));
import {LiveAdapter} from '../../../src/data/live/adapter';
import type {Settings} from '../../../src/data/types';
const mocks=vi.hoisted(()=>({from:vi.fn(),owner:vi.fn(async()=> 'owner-1')}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({from:mocks.from})}));
vi.mock('../../../src/data/live/helpers',async original=>({...await original<typeof import('../../../src/data/live/helpers')>(),owner:mocks.owner}));
const card=(id:number)=>({id:String(id).padStart(8,'0'),state:2,due:'2026-11-22T04:00:00Z',notes:{projects:{slug:'real',subjects:{name:'Analysis'}}}});
function page(data:unknown[],error:unknown=null){
 const q:Record<string,ReturnType<typeof vi.fn>>={};
 for(const method of ['select','eq','neq','lt','order','limit','gt'])q[method]=vi.fn(()=>q);
 q.then=vi.fn(resolve=>Promise.resolve({data,error}).then(resolve));return q;
}
describe('KC4: owner-scoped live path forecast',()=>{
 beforeEach(()=>{vi.stubGlobal('navigator',{onLine:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));mocks.from.mockReset();mocks.owner.mockClear();vi.spyOn(LiveAdapter.prototype,'getSettings').mockResolvedValue({timeZone:'UTC',rolloverHour:4} as Settings);});
 afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
 it('pages metadata beyond the server cap with a stable keyset and explicit owner filters on every request',async()=>{
  const first=page(Array.from({length:500},(_,i)=>card(i))),last=page([card(500)]);
  mocks.from.mockReturnValueOnce(first).mockReturnValueOnce(last);
  const forecast=await new LiveAdapter().getPathReviewForecast();
  expect(forecast[13].due).toBe(501);
  expect(forecast[13].paths).toEqual([{slug:'real',subject:'Analysis',due:501}]);
  for(const q of [first,last]){
   expect(q.eq).toHaveBeenCalledWith('user_id','owner-1');
   expect(q.eq).toHaveBeenCalledWith('notes.status','active');
   expect(q.eq).toHaveBeenCalledWith('notes.projects.system',false);
   expect(q.neq).toHaveBeenCalledWith('notes.projects.status','archived');
   expect(q.neq).toHaveBeenCalledWith('state',0);
   expect(q.lt).toHaveBeenCalledWith('due','2026-11-23T04:00:00.000Z');
   expect(q.limit).toHaveBeenCalledWith(500);
   expect(q.order).toHaveBeenCalledWith('id',{ascending:true});
   expect(q.select.mock.calls[0][0]).not.toMatch(/\*|front|back|stability/);
  }
  expect(last.gt).toHaveBeenCalledWith('id','00000499');
 });
 it('rejects a failed later page instead of displaying partial totals',async()=>{
  mocks.from.mockReturnValueOnce(page(Array.from({length:500},(_,i)=>card(i)))).mockReturnValueOnce(page([], {code:'42501',message:'not permitted'}));
  await expect(new LiveAdapter().getPathReviewForecast()).rejects.toMatchObject({code:'auth'});
 });
 it('refuses repeated pages instead of counting them forever',async()=>{
  mocks.from.mockImplementation(()=>page(Array.from({length:500},(_,i)=>card(i))));
  await expect(new LiveAdapter().getPathReviewForecast()).rejects.toThrow('did not advance');
 });
});
