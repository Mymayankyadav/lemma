import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import DeleteAccount,{canDeleteAccount,DELETE_CONFIRMATION} from '../../../src/features/settings/v6/DeleteAccount';
const {invoke,signOut,navigate,getMode}=vi.hoisted(()=>({
 invoke:vi.fn(),signOut:vi.fn(),navigate:vi.fn(),getMode:vi.fn(),
}));
vi.mock('../../../src/data/mode',()=>({getMode:()=>getMode()}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({
 functions:{invoke},auth:{signOut},
})}));
vi.mock('react-router',()=>({useNavigate:()=>navigate}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));
beforeEach(()=>{invoke.mockReset();signOut.mockReset();navigate.mockReset();
 getMode.mockReturnValue('live')});
describe('N103 deliberate account deletion control',()=>{
 it('opens the actual parent export section instead of a dead settings URL',()=>{
  const go=vi.fn();
  render(<DeleteAccount onExport={go}/>);
  fireEvent.click(screen.getByRole('button',{name:'Open export settings'}));
  expect(go).toHaveBeenCalledTimes(1);
 });
 it('refuses demo and incomplete confirmation without ever invoking deletion',()=>{
  expect(canDeleteAccount(DELETE_CONFIRMATION,true,false,'demo')).toBe(false);
  expect(canDeleteAccount(DELETE_CONFIRMATION,false,false,'live')).toBe(false);
  expect(canDeleteAccount(DELETE_CONFIRMATION,true,true,'live')).toBe(false);
  getMode.mockReturnValue('demo');
  render(<DeleteAccount onExport={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'Delete account permanently'}))
   .toBeDisabled();
  expect(invoke).not.toHaveBeenCalled();
 });
 it('requires typed text AND explicit export choice before a single owner-free request',async()=>{
  invoke.mockResolvedValue({data:{deleted:true},error:null});
  signOut.mockResolvedValue({error:null});
  render(<DeleteAccount onExport={vi.fn()}/>);
  const button=screen.getByRole('button',{name:'Delete account permanently'});
  fireEvent.change(screen.getByRole('textbox',{name:'Type delete confirmation'}),{
   target:{value:DELETE_CONFIRMATION}});
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(button).not.toBeDisabled();
  fireEvent.click(button);
  await waitFor(()=>expect(invoke).toHaveBeenCalledTimes(1));
  expect(invoke).toHaveBeenCalledWith('account-delete',{
   body:{confirmation:DELETE_CONFIRMATION,exportAcknowledged:true}});
  expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/user_id|ownerId|p_user/);
  await waitFor(()=>expect(navigate).toHaveBeenCalledWith('/sign-in',{replace:true}));
 });
 it('keeps the account screen visible on an unverified deletion',async()=>{
  invoke.mockResolvedValue({data:{deleted:false},error:null});
  render(<DeleteAccount onExport={vi.fn()}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'Type delete confirmation'}),{
   target:{value:DELETE_CONFIRMATION}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Delete account permanently'}));
  await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(navigate).not.toHaveBeenCalled();
 });
});
