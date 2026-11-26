// @vitest-environment jsdom
import React from 'react';
import {expect,it,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'react';
import {MemoryRouter} from 'react-router';
import InboxV7 from '../../../src/features/proposals/v7/InboxV7';
import {cardTypeText,noteKindText} from '../../../src/lib/labels';

const fixture=vi.hoisted(()=>({decide:vi.fn(),held:new Set(),proposal:{id:'p1',kind:'card',projectSlug:'proofs',projectGlyph:'M',sessionNumber:1,origin:'chatgpt',reason:null,createdAt:'2026-11-14T10:00:00Z',card:{front:'Question',back:'Answer',type:'basic',kind:'why'},cardEdit:null,plan:null,planChange:null}}));
vi.mock('../../../src/data/hooks',()=>({
 useProposals:()=>({data:[fixture.proposal],isSuccess:true,isPending:false,isError:false,refetch:vi.fn()}),
 useProjects:()=>({data:[]}),useSettings:()=>({data:{macros:'',ui:{haptics:false}}}),useProject:()=>({data:null}),
}));
vi.mock('../../../src/features/proposals/v7/useInboxDecisions',()=>({useInboxDecisions:()=>({held:fixture.held,decide:fixture.decide})}));
vi.mock('../../../src/app/v7/PageHeaders',()=>({DetailHeader:()=>null}));
vi.mock('../../../src/ui/MathText',()=>({MathText:({source}:any)=><span>{source}</span>}));
vi.mock('../../../src/ui/v7/LottieMoment',()=>({LottieMoment:()=>null,warmMoment:()=>{}}));
vi.mock('../../../src/app/v7/useMinWidth',()=>({useMinWidth:()=>false}));
vi.mock('../../../src/ui/v7/components',()=>({
 Button:({children,onClick,disabled}:any)=><button onClick={onClick} disabled={disabled}>{children}</button>,
 IconButton:({label,onClick,children}:any)=><button aria-label={label} onClick={onClick}>{children}</button>,
 Segmented:()=>null,Checkbox:()=>null,Skeleton:()=>null,
 Sheet:({open,children,footer}:any)=>open?<section>{children}{footer}</section>:null,
 Picker:({label,value,options,onChange}:any)=><label>{label}<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map((o:string)=><option key={o}>{o}</option>)}</select></label>,
}));

it('forwards the chosen card Type and Kind when Save and approve is pressed',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 // Stable query data, matching the real query cache.
 const proposal=fixture.proposal;const hooks=await import('../../../src/data/hooks');
 vi.spyOn(hooks,'useProposals').mockReturnValue({data:[proposal],isSuccess:true,isPending:false,isError:false,refetch:vi.fn()} as any);
 const media={matches:false,addEventListener:()=>{},removeEventListener:()=>{}};
 vi.stubGlobal('matchMedia',()=>media);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/proposals']}><InboxV7/></MemoryRouter>)});
  await act(async()=>{(host.querySelector('button[aria-label="Edit"]') as HTMLButtonElement).click()});
  const type=host.querySelector('select[aria-label="Type"]') as HTMLSelectElement;
  const kind=host.querySelector('select[aria-label="Kind"]') as HTMLSelectElement;
  expect(type).not.toBeNull();expect(kind).not.toBeNull();
  await act(async()=>{type.value=cardTypeText('reverse');type.dispatchEvent(new Event('change',{bubbles:true}));kind.value=noteKindText('theorem');kind.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Save and approve')!.click()});
  console.info('Inbox approval edit payload',fixture.decide.mock.calls.at(-1)?.[2]);
  expect(fixture.decide).toHaveBeenCalledWith([proposal],'approve',expect.objectContaining({type:'reverse',kind:'theorem'}));
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
