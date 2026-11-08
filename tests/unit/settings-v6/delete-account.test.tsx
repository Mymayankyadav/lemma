import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import DeleteAccount,{canDeleteAccount,DELETE_CONFIRMATION} from '../../../src/features/settings/v6/DeleteAccount';

const mocks=vi.hoisted(()=>({invoke:vi.fn(),signOut:vi.fn(),
 navigate:vi.fn(),getMode:vi.fn()}));
vi.mock('../../../src/data/mode',()=>({getMode:()=>mocks.getMode()}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({
 functions:{invoke:mocks.invoke},auth:{signOut:mocks.signOut},
})}));
vi.mock('react-router',()=>({useNavigate:()=>mocks.navigate}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));

let root:Root,host:HTMLDivElement;
beforeEach(()=>{
 mocks.invoke.mockReset();mocks.signOut.mockReset();mocks.navigate.mockReset();
 mocks.getMode.mockReturnValue('live');
 host=document.createElement('div');document.body.append(host);
 root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove()});
async function render(onExport=vi.fn()){
 await act(async()=>root.render(<DeleteAccount onExport={onExport}/>));
 return onExport;
}
function button(text:string){
 const node=[...host.querySelectorAll<HTMLButtonElement>('button')]
  .find(x=>x.textContent?.includes(text));
 if(!node)throw Error('Missing button '+text);
 return node;
}
async function confirm(){
 const input=host.querySelector<HTMLInputElement>('input[aria-label="Type delete confirmation"]');
 if(!input)throw Error('Missing confirmation input');
 await act(async()=>{
  // React tracks input values: use the native setter before dispatch.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!
   .call(input,DELETE_CONFIRMATION);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const checkbox=host.querySelector<HTMLInputElement>('input[type=checkbox]');
 if(!checkbox)throw Error('Missing export acknowledgment');
 await act(async()=>checkbox.click());
}
describe('N103 deliberate account deletion control',()=>{
 it('opens the actual parent Settings export section',async()=>{
  const onExport=await render();
  await act(async()=>button('Open export settings').click());
  expect(onExport).toHaveBeenCalledTimes(1);
 });
 it('refuses demo, missing export acknowledgment and incomplete confirmation',async()=>{
  expect(canDeleteAccount(DELETE_CONFIRMATION,true,false,'demo')).toBe(false);
  expect(canDeleteAccount(DELETE_CONFIRMATION,false,false,'live')).toBe(false);
  expect(canDeleteAccount(DELETE_CONFIRMATION,true,true,'live')).toBe(false);
  mocks.getMode.mockReturnValue('demo');
  await render();
  expect(button('Delete account permanently').disabled).toBe(true);
  expect(mocks.invoke).not.toHaveBeenCalled();
 });
 it('sends one owner-free request only after typed text and explicit export choice',async()=>{
  mocks.invoke.mockResolvedValue({data:{deleted:true},error:null});
  mocks.signOut.mockResolvedValue({error:null});
  await render();
  expect(button('Delete account permanently').disabled).toBe(true);
  await confirm();
  expect(button('Delete account permanently').disabled).toBe(false);
  await act(async()=>button('Delete account permanently').click());
  await vi.waitFor(()=>expect(mocks.invoke).toHaveBeenCalledTimes(1));
  expect(mocks.invoke).toHaveBeenCalledWith('account-delete',{
   body:{confirmation:DELETE_CONFIRMATION,exportAcknowledged:true}});
  expect(JSON.stringify(mocks.invoke.mock.calls)).not.toMatch(/user_id|ownerId|p_user/);
  await vi.waitFor(()=>expect(mocks.navigate)
   .toHaveBeenCalledWith('/sign-in',{replace:true}));
 });
 it('does not redirect or claim success when deletion is unverified',async()=>{
  mocks.invoke.mockResolvedValue({data:{deleted:false},error:null});
  await render();await confirm();
  await act(async()=>button('Delete account permanently').click());
  await vi.waitFor(()=>expect(host.querySelector('[role=alert]')).not.toBeNull());
  expect(mocks.navigate).not.toHaveBeenCalled();
 });
});
