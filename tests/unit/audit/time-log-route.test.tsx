import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {expect,it,vi} from 'vitest';
import TimeLogV7 from '../../../src/features/time-log/v7/TimeLogV7';
const fake=vi.hoisted(()=>({api:{listStudyEntries:vi.fn(async()=>[])}}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>fake.api}));
vi.mock('../../../src/data/hooks',()=>({useSettings:()=>({data:{timeZone:'UTC'}}),useProjects:()=>({data:[]})}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>()=>{}}));
vi.mock('../../../src/app/v7/V7Shell',()=>({HubHeader:({children}:any)=><header>{children}</header>}));
it('keeps the hash router intact and opens the selected day’s week',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<MemoryRouter initialEntries={['/log?day=2026-10-06']}><TimeLogV7/></MemoryRouter>));
  const links=[...host.querySelectorAll('a.v7-log-day')];expect(links).toHaveLength(7);
  expect(links.map(link=>link.getAttribute('href'))).toContain('#/log?day=2026-10-06');
  expect(links.every(link=>link.getAttribute('href')?.startsWith('#/log?day='))).toBe(true);
  expect(fake.api.listStudyEntries).toHaveBeenCalledWith({start:'2026-10-05T00:00:00.000Z',end:'2026-10-12T00:00:00.000Z'});
 }finally{await act(async()=>root.unmount());host.remove();}
});
