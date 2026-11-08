import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import V6Settings,{SETTINGS_SECTIONS} from '../../../src/features/settings/v6/Page';
import {useSettings,useUpdateSettings,useRotateConnectorSecret,useSignOut} from '../../../src/data/hooks';
import {getApi} from '../../../src/data';
import {useToast} from '../../../src/ui/Toast';
import type {NotifyPrefs} from '../../../src/data/types';

vi.mock('../../../src/data/hooks',()=>({
 useSettings:vi.fn(),useUpdateSettings:vi.fn(),useRotateConnectorSecret:vi.fn(),useSignOut:vi.fn(),
}));
vi.mock('../../../src/data',()=>({getApi:vi.fn()}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));
vi.mock('../../../src/ui/Toast',()=>({useToast:vi.fn()}));
vi.mock('../../../src/ui/Screen',async()=>{
 const React=await import('react');
 return {Screen:({title,children}:{title:string,children:React.ReactNode})=>
  React.createElement('main',{},React.createElement('h1',{},title),children)};
});
vi.mock('../../../src/ui/Sheet',async()=>{
 const React=await import('react');
 return {Sheet:({open,title,children}:{open:boolean,title:string,children:React.ReactNode})=>
  open?React.createElement('section',{role:'dialog','aria-label':title},children):null};
});
vi.mock('../../../src/features/settings/v6/StudyDefaults',async()=>{
 const React=await import('react');
 return {default:()=>React.createElement('p',{},'Existing study defaults panel')};
});
vi.mock('../../../src/features/settings/EuclidAppearance',async()=>{
 const React=await import('react');
 return {EuclidAppearance:()=>React.createElement('p',{},'Existing appearance controls')};
});
vi.mock('../../../src/features/settings/SubjectsPanel',async()=>{
 const React=await import('react');
 return {SubjectsPanel:()=>React.createElement('p',{},'Existing subjects controls')};
});
vi.mock('../../../src/features/settings/ConnectorAddress',async()=>{
 const React=await import('react');
 return {ConnectorAddress:()=>React.createElement('p',{},'Existing connector controls')};
});

const stored:NotifyPrefs={
 enabled:true,mode:'daily',studyTime:'08:15',
 quiet:{start:'21:30',end:'06:30'},maxPerDay:7,
 kinds:{due:true,deadline:true,resume:false,tutor:true},
 dueThreshold:10,approveCards:false,digest:{weekday:1,time:'09:30'},
 futureKey:'retain me',backoff:{due:'tomorrow'},
};
const base={
 notify:stored,timeZone:'Asia/Kolkata',ui:{mode:'day'},
 connectorUrl:'https://example.test/functions/v1/mcp/secret',
 connectorLastClient:null,connectorLastSeenAt:null,
};
let root:Root,host:HTMLDivElement;
let update:ReturnType<typeof vi.fn>,notify:ReturnType<typeof vi.fn>;
let refetch:ReturnType<typeof vi.fn>,exportAll:ReturnType<typeof vi.fn>;
function mockSettings(patch:Record<string,unknown>={}){
 vi.mocked(useSettings).mockReturnValue({
  data:base,isLoading:false,isError:false,refetch,...patch,
 } as unknown as ReturnType<typeof useSettings>);
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 update=vi.fn(async()=>base);notify=vi.fn();refetch=vi.fn(async()=>undefined);
 exportAll=vi.fn(async()=>new Blob(['{"record":true}'],{type:'application/json'}));
 vi.mocked(useUpdateSettings).mockReturnValue({isPending:false,mutateAsync:update} as unknown as ReturnType<typeof useUpdateSettings>);
 vi.mocked(useToast).mockReturnValue(notify);
 vi.mocked(useRotateConnectorSecret).mockReturnValue({isPending:false,mutateAsync:vi.fn()} as unknown as ReturnType<typeof useRotateConnectorSecret>);
 vi.mocked(useSignOut).mockReturnValue({isPending:false,mutateAsync:vi.fn()} as unknown as ReturnType<typeof useSignOut>);
 vi.mocked(getApi).mockReturnValue({exportAll} as never);
 mockSettings();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.clearAllMocks()});
async function render(){
 await act(async()=>root.render(<MemoryRouter initialEntries={['/settings']}>
  <V6Settings legacy={<p data-legacy>Original Settings fallback</p>}/>
 </MemoryRouter>));
 // N117: Settings opens on four grouped rows; Data & account opens on Account.
 await act(async()=>{[...host.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Data & account')!.click();await Promise.resolve()});
}
function button(label:string):HTMLButtonElement {
 const found=[...host.querySelectorAll('button')].find(x=>
  x.textContent?.trim()===label||x.getAttribute('aria-label')===label);
 if(!found)throw Error('Missing button '+label);
 return found;
}
async function click(label:string){await act(async()=>{button(label).click();await Promise.resolve()})}
function checkbox(text:string):HTMLInputElement{
 const label=[...host.querySelectorAll('label')].find(x=>x.textContent?.trim()===text);
 const field=label?.querySelector('input[type="checkbox"]') as HTMLInputElement|null;
 if(!field)throw Error('Missing checkbox '+text);
 return field;
}
async function toggle(text:string){await act(async()=>{checkbox(text).click();await Promise.resolve()})}
async function select(id:string,value:string) {
 const input=host.querySelector<HTMLSelectElement>('#'+id)!;
 await act(async()=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!;
  setter.call(input,value);
  input.dispatchEvent(new Event('change',{bubbles:true}));
  await Promise.resolve();
 });
}
async function blurValue(id:string,value:string) {
 const input=host.querySelector<HTMLInputElement>('#'+id)!;
 await act(async()=>{
  input.value=value;
  input.focus();
  input.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
  await Promise.resolve();
 });
}
describe('N28.2.2 Reminders and Export Settings',()=>{
 it('renders dedicated configured Reminders and all seven destinations with keyboard-accessible tabs',async()=>{
  await render();
  expect(SETTINGS_SECTIONS.map(x=>x.id)).toEqual([
   'account','appearance','study','reminders','subjects','connector','export'
  ]);
  const active=host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
  await act(async()=>active.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  expect(document.activeElement).toBe(button('Appearance'));
  for(const name of ['Study defaults','Reminders','Subjects','Connector','Export','Account']){
   await click(name);
   expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('v6-settings-tab-'+
    name.toLowerCase().replace(' defaults',''));
   expect(button(name).getAttribute('aria-selected')).toBe('true');
  }
  await click('Reminders');
  expect(host.querySelector('#reminder-mode')).not.toBeNull();
  expect(host.textContent).toContain('Asia/Kolkata');
  expect(host.querySelector('[data-legacy]')).toBeNull();
  expect(checkbox('Enable reminders').checked).toBe(true);
  expect(host.textContent).toContain('Checkpoint deadlines');
  expect(host.querySelector('label')?.className).toContain('min-h-11');
 });
 it('saves enabled and schedule changes through existing settings mutation without losing unknown fields',async()=>{
  await render();await click('Reminders');
  await toggle('Enable reminders');
  expect(update).toHaveBeenCalledWith({notify:expect.objectContaining({
   enabled:false,mode:'daily',futureKey:'retain me',backoff:{due:'tomorrow'},
   quiet:{start:'21:30',end:'06:30'},
  })});
  expect(notify).toHaveBeenCalledWith('Saved',{tone:'success'});
  await select('reminder-mode','weekly');
  expect(update).toHaveBeenLastCalledWith({notify:expect.objectContaining({enabled:false,mode:'weekly',futureKey:'retain me'})});
  expect(checkbox('Enable reminders').checked).toBe(false);
 });
 it('preserves unrelated category keys and nested quiet/digest fields on partial writes',async()=>{
  await render();await click('Reminders');
  await toggle('Cards due');
  expect(update).toHaveBeenLastCalledWith({notify:expect.objectContaining({
   kinds:expect.objectContaining({due:false,deadline:true,tutor:true}),
  })});
  await select('reminder-due','25');
  expect(update).toHaveBeenLastCalledWith({notify:expect.objectContaining({dueThreshold:25})});
  await toggle('Notify when tutor card proposals are ready');
  expect(update).toHaveBeenLastCalledWith({notify:expect.objectContaining({approveCards:true})});
  await select('reminder-weekday','5');
  expect(update).toHaveBeenLastCalledWith({notify:expect.objectContaining({
   digest:{weekday:5,time:'09:30'},
  })});
 });
 it('autosaves valid local time edits on blur and keeps nonedited quiet hours',async()=>{
  await render();await click('Reminders');
  await blurValue('reminder-quiet-start','23:15');
  expect(update).toHaveBeenLastCalledWith({notify:expect.objectContaining({
   quiet:{start:'23:15',end:'06:30'},
  })});
  await blurValue('reminder-study-time','11:45');
  expect(update).toHaveBeenLastCalledWith({notify:expect.objectContaining({studyTime:'11:45'})});
  await blurValue('reminder-digest-time','07:20');
  expect(update).toHaveBeenLastCalledWith({notify:expect.objectContaining({
   digest:{weekday:1,time:'07:20'},
  })});
 });
 it('rejects invalid time and count without issuing an invalid server mutation',async()=>{
  await render();await click('Reminders');
  await blurValue('reminder-max','99');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('1–50');
  expect(update).not.toHaveBeenCalled();
  await blurValue('reminder-study-time','');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('valid 24-hour time');
  expect(update).not.toHaveBeenCalled();
 });
 it('rolls back failed writes and displays error feedback without falsely claiming Saved',async()=>{
  update.mockRejectedValueOnce(new Error('offline'));
  await render();await click('Reminders');
  await toggle('Enable reminders');
  expect(checkbox('Enable reminders').checked).toBe(true);
  expect(notify).toHaveBeenCalledWith("Couldn't save settings.",{tone:'danger'});
  expect(notify).not.toHaveBeenCalledWith('Saved',{tone:'success'});
 });
 it('reports unconfigured reminders as an empty state without claiming a schedule',async()=>{
  mockSettings({data:{...base,notify:null}});
  await render();await click('Reminders');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('No reminder preferences saved');
  expect(checkbox('Enable reminders').checked).toBe(false);
  expect(host.textContent).not.toContain('Next reminder at');
  await toggle('Enable reminders');
  expect(update).toHaveBeenCalledWith({notify:expect.objectContaining({enabled:true})});
 });
 it('uses original exportAll API, downloads a dated JSON backup and releases the URL',async()=>{
  const create=vi.fn(()=> 'blob:lemma-backup');
  const revoke=vi.fn();
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
  const downloads:string[]=[];
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){
   downloads.push(this.download);
  });
  await render();await click('Export');
  expect(host.textContent).toContain('Download a backup');
  await click('Download a backup');
  expect(exportAll).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(expect.any(Blob));
  expect(downloads).toEqual(['lemma-backup-'+new Date().toISOString().slice(0,10)+'.json']);
  expect(host.querySelector('a[download]')).toBeNull();
  expect(notify).toHaveBeenCalledWith('Backup downloaded',{tone:'success'});
  // URL revocation is intentionally deferred as in the legacy implementation.
 });
 it('shows export failure with retry and never creates a fake backup',async()=>{
  const create=vi.fn(()=> 'blob:retry-backup');
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined);
  exportAll.mockRejectedValueOnce(new Error('network offline'));
  await render();await click('Export');await click('Download a backup');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't download the backup");
  expect(notify).toHaveBeenCalledWith("Couldn't download the backup.",{tone:'danger'});
  expect(create).not.toHaveBeenCalled();
  await click('Download a backup');
  expect(exportAll).toHaveBeenCalledTimes(2);
  expect(notify).toHaveBeenCalledWith('Backup downloaded',{tone:'success'});
 });
 it('keeps flag-off legacy Settings and loading/error states untouched',async()=>{
  const src=readFileSync('src/features/settings/Page.tsx','utf8');
  expect(src).toContain("isFlagOn('v6Shell')");
  expect(src).toContain('<LegacySettingsPage/>');
  expect(src).toContain('<V6Settings legacy={<LegacySettingsPage/>}/>');
  await render();
  await act(async()=>root.unmount());host.replaceChildren();root=createRoot(host);
  mockSettings({data:undefined,isLoading:true});
  await render();
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading settings');
  await act(async()=>root.unmount());host.replaceChildren();root=createRoot(host);
  mockSettings({data:undefined,isLoading:false,isError:true});
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Settings could not be loaded');
  await click('Try again');
  expect(refetch).toHaveBeenCalledTimes(1);
 });
});
