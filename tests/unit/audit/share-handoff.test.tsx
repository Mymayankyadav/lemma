import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,useLocation} from 'react-router';
import {expect,it,vi} from 'vitest';
import NewPathSheet from '../../../src/features/projects/v7/NewPathSheet';
import {holdSharedSources,takeSharedSources} from '../../../src/platform/share';
const f=vi.hoisted(()=>({enqueue:vi.fn(),setName:vi.fn(),submit:vi.fn(async()=>({kind:'idle'}))}));
vi.mock('../../../src/features/new-project/useNewPath',()=>({bytes:()=>'',useNewPath:()=>({name:'Proofs',setName:f.setName,items:[],error:null,saving:false,created:null,remaining:0,enqueue:f.enqueue,remove:()=>{},submit:f.submit})}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>()=>{}}));
vi.mock('../../../src/ui/v7/components',()=>({Sheet:({children,footer}:any)=><div>{children}{footer}</div>,Field:()=>null,Button:({children,form,type}:any)=><button form={form} type={type}>{children}</button>,IconButton:()=>null}));
const file=(name:string)=>new File(['Proof'],name,{type:'text/markdown'});
it('delivers later shares to an already open sheet and retains files received during upload',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});takeSharedSources();f.enqueue.mockClear();
 let finish!:(value:any)=>void;f.submit.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function Route(){return <p id="route">{useLocation().pathname}</p>;}
 try{
  holdSharedSources([file('first.md')]);
  await act(async()=>root.render(<MemoryRouter initialEntries={['/projects/new']}><NewPathSheet onClose={()=>{}}/><Route/></MemoryRouter>));
  await act(async()=>holdSharedSources([file('second.md')]));
  expect(f.enqueue.mock.calls.map(([files])=>files.map((value:File)=>value.name))).toEqual([['first.md'],['second.md']]);
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await act(async()=>holdSharedSources([file('third.md')]));expect(f.enqueue).toHaveBeenCalledTimes(2);
  await act(async()=>finish({kind:'created',project:{slug:'proofs'}}));
  expect(f.enqueue.mock.calls[2][0].map((value:File)=>value.name)).toEqual(['third.md']);
  expect(host.querySelector('#route')?.textContent).toBe('/projects/new');
 }finally{await act(async()=>root.unmount());host.remove();takeSharedSources();}
});
