import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import V6Settings,{SETTINGS_GROUPS,SETTINGS_SECTIONS,settingsTabDestination} from '../../../src/features/settings/v6/Page';
import {useSettings,useUpdateSettings,useRotateConnectorSecret,useSignOut} from '../../../src/data/hooks';
import {useToast} from '../../../src/ui/Toast';

vi.mock('../../../src/data/hooks',()=>({
  useSettings:vi.fn(),useUpdateSettings:vi.fn(),
  useRotateConnectorSecret:vi.fn(),useSignOut:vi.fn()
}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
vi.mock('../../../src/ui/Toast',()=>({useToast:vi.fn()}));
vi.mock('../../../src/ui/Screen',async()=>{
  const React=await import('react');
  return {Screen:({title,children}:{title:string,children:React.ReactNode})=>
    React.createElement('main',{},React.createElement('h1',{},title),children)};
});
vi.mock('../../../src/ui/Sheet',async()=>{
  const React=await import('react');
  return {Sheet:({open,title,children,footer}:{open:boolean,title:string,children:React.ReactNode,footer?:React.ReactNode})=>
    open?React.createElement('section',{role:'dialog','aria-label':title},children,footer):null};
});
vi.mock('../../../src/features/settings/EuclidAppearance',async()=>{
  const React=await import('react');
  return {EuclidAppearance:({onChange}:{onChange:(patch:{mode:'night'})=>Promise<boolean>})=>
    React.createElement('button',{type:'button',onClick:()=>void onChange({mode:'night'})},'Choose Night')};
});
vi.mock('../../../src/features/settings/SubjectsPanel',async()=>{
  const React=await import('react');
  return {SubjectsPanel:()=>React.createElement('div',{'data-subjects-reused':'true'},'Existing subjects controls')};
});

const data={
  ui:{mode:'day'},connectorUrl:'https://example.test/functions/v1/mcp/private-token',
  connectorLastSeenAt:null,connectorLastClient:null,
};
let root:Root,host:HTMLDivElement;
let notify:ReturnType<typeof vi.fn>,update:ReturnType<typeof vi.fn>,
  rotate:ReturnType<typeof vi.fn>,signOut:ReturnType<typeof vi.fn>,refetch:ReturnType<typeof vi.fn>;

function mockSettings(override:Record<string,unknown>={}){
  vi.mocked(useSettings).mockReturnValue({
    data,isLoading:false,isError:false,refetch,...override
  } as unknown as ReturnType<typeof useSettings>);
}
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  notify=vi.fn();update=vi.fn(async()=>data);rotate=vi.fn(async()=>undefined);
  signOut=vi.fn(async()=>undefined);refetch=vi.fn(async()=>undefined);
  vi.mocked(useToast).mockReturnValue(notify);
  vi.mocked(useUpdateSettings).mockReturnValue({isPending:false,mutateAsync:update} as unknown as ReturnType<typeof useUpdateSettings>);
  vi.mocked(useRotateConnectorSecret).mockReturnValue({isPending:false,mutateAsync:rotate} as unknown as ReturnType<typeof useRotateConnectorSecret>);
  vi.mocked(useSignOut).mockReturnValue({isPending:false,mutateAsync:signOut} as unknown as ReturnType<typeof useSignOut>);
  mockSettings();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks()});

async function render(group='Data & account'){
  await act(async()=>root.render(<MemoryRouter initialEntries={['/settings']}>
    <V6Settings legacy={<p>Existing settings: memory, reminders and export controls</p>}/>
  </MemoryRouter>));
  // N117: Settings opens on four grouped rows; Data & account opens on Account.
  // N121 F9: each group page shows only its own sections, so a test opens the group it needs.
  await act(async()=>{[...host.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===group)!.click();await Promise.resolve();});
}
function button(label:string){
  const found=[...host.querySelectorAll('button')].find(x=>x.textContent?.trim()===label||x.getAttribute('aria-label')===label);
  if(!found)throw Error('Missing button '+label);
  return found;
}
async function click(label:string){
  await act(async()=>{button(label).click();await Promise.resolve();});
}
function selected(){return host.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();}

describe('N28.1 v6 Settings core panels',()=>{
  it('has seven keyboard-operable sections, moves focus and preserves legacy fallback',async()=>{
    expect(SETTINGS_SECTIONS.map(x=>x.id)).toEqual([
      'account','appearance','study','reminders','subjects','connector','export'
    ]);
    expect(settingsTabDestination('account','ArrowLeft')).toBe('export');
    expect(settingsTabDestination('account','End')).toBe('export');
    expect(settingsTabDestination('export','Home')).toBe('account');
    expect(settingsTabDestination('account','Enter')).toBeNull();
    await render();
    expect(selected()).toBe('Account');
    const current=host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
    await act(async()=>current.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'})));
    expect(selected()).toBe('Subjects');
    expect(document.activeElement).toBe(button('Subjects'));
    expect(host.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
    await act(async()=>root.unmount());root=createRoot(host);host.replaceChildren();
    await act(async()=>root.render(<MemoryRouter initialEntries={['/settings?section=reminders']}>
      <V6Settings legacy={<p>Existing settings: memory, reminders and export controls</p>}/>
    </MemoryRouter>));
    expect(selected()).toBe('Reminders');
    expect(host.textContent).toContain('Existing settings: memory, reminders and export');
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('v6-settings-tab-reminders');
  });
  it('N117 opens on the four mockup groups, each opening its section page',async()=>{
    await act(async()=>root.render(<MemoryRouter initialEntries={['/settings']}>
      <V6Settings legacy={<p>Existing settings</p>}/>
    </MemoryRouter>));
    const rows=[...host.querySelectorAll<HTMLButtonElement>('.lemma-settings-link')];
    expect(rows.map(x=>x.getAttribute('aria-label'))).toEqual(['Appearance','Tutor','Study & review','Data & account']);
    expect(SETTINGS_GROUPS.map(x=>x.description)).toContain('Day, Night and reading comfort');
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    await act(async()=>{rows[1].click();await Promise.resolve();});
    expect(selected()).toBe('Connector');
    expect(host.querySelector('.lemma-settings-page h2')?.textContent).toBe('Tutor');
    // N121 F9: the group shows only its sections; the header Back (history) returns to the index.
    expect([...host.querySelectorAll('[role="tab"]')].map(x=>x.textContent?.trim())).toEqual(['Connector','Teaching style']);
    await act(async()=>root.unmount());root=createRoot(host);host.replaceChildren();
    await act(async()=>root.render(<MemoryRouter initialEntries={['/settings']}>
      <V6Settings legacy={<p>Existing settings</p>}/>
    </MemoryRouter>));
    expect(host.querySelectorAll('.lemma-settings-link')).toHaveLength(4);
    await act(async()=>root.unmount());root=createRoot(host);host.replaceChildren();
    await act(async()=>root.render(<MemoryRouter initialEntries={['/settings?section=planning']}>
      <V6Settings legacy={<p>Existing settings</p>}/>
    </MemoryRouter>));
    expect(selected()).toBe('Planning');
  });
  it('saves appearance using the existing update-settings hook and reports errors',async()=>{
    await render('Appearance');
    await click('Choose Night');
    expect(update).toHaveBeenCalledWith({ui:{mode:'night'}});
    expect(notify).toHaveBeenCalledWith('Saved',{tone:'success'});
    update.mockRejectedValueOnce(new Error('offline'));
    await click('Choose Night');
    expect(notify).toHaveBeenCalledWith("Couldn't save settings.",{tone:'danger'});
  });
  it('reuses the existing subject-management panel rather than reimplementing mutations',async()=>{
    await render();
    await click('Subjects');
    expect(host.querySelector('[data-subjects-reused]')).not.toBeNull();
  });
  it('masks secret connector URL until reveal, copies only when requested, and rotates after confirmation',async()=>{
    const clipboard=vi.fn(async()=>undefined);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:clipboard}});
    await render('Tutor');
    expect(host.textContent).toContain('••••••');
    expect(host.textContent).not.toContain('private-token');
    await click('Show connector address');
    expect(host.textContent).toContain('private-token');
    await click('Copy connector address');
    expect(clipboard).toHaveBeenCalledWith(data.connectorUrl);
    await click('Make a new address');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('old address stops working');
    expect(rotate).not.toHaveBeenCalled();
    await click('Make new');
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain('private-token');
  });
  it('signs out via the same mutation and distinguishes loading, empty/error states',async()=>{
    await render();
    await click('Sign out');
    expect(signOut).toHaveBeenCalledTimes(1);
    await act(async()=>root.unmount());root=createRoot(host);host.replaceChildren();
    mockSettings({data:undefined,isLoading:true});
    await render();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading settings');
    await act(async()=>root.unmount());root=createRoot(host);host.replaceChildren();
    mockSettings({data:undefined,isLoading:false,isError:true});
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    await click('Try again');
    expect(refetch).toHaveBeenCalled();
  });
  it('routes only flag-on screens to v6 while keeping the legacy Settings component',()=>{
    const source=readFileSync('src/features/settings/Page.tsx','utf8');
    expect(source).toContain("isFlagOn('v6Shell')");
    expect(source).toContain('<LegacySettingsPage/>');
    expect(source).toContain('<V6Settings legacy={<LegacySettingsPage/>}/>');
  });
});