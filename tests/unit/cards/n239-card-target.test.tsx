import {act,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import CardV7 from '../../../src/features/card/v7/CardV7';
import type {CardDetail} from '../../../src/data/types';

const f=vi.hoisted(()=>({details:{} as Record<number,CardDetail>,save:vi.fn(),notify:vi.fn()}));
vi.mock('../../../src/data/hooks',()=>({
 useCard:(no:number)=>({data:f.details[no]}),useUpdateNote:()=>({mutateAsync:f.save}),
 useProjects:()=>({data:[]}),useSettings:()=>({data:{macros:'',timeZone:'UTC'}}),useProject:()=>({data:{checkpoints:[]}}),
 useSetNoteStatus:()=>({}),useAddComment:()=>({}),useDismissComment:()=>({}),
}));
vi.mock('../../../src/data/StudyUiRelease',()=>({useStudyUi:()=>false}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>f.notify}));
vi.mock('../../../src/app/v7/useMinWidth',()=>({useMinWidth:()=>false}));
vi.mock('../../../src/app/v7/V7Shell',()=>({DetailHeader:()=>null}));
vi.mock('../../../src/app/v7/Margin',()=>({Margin:()=>null}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>false}));
vi.mock('../../../src/ui/MathText',()=>({MathText:()=>null}));
vi.mock('../../../src/ui/v7/ActionSheet',()=>({ActionSheet:()=>null}));
vi.mock('../../../src/ui/v7/Dock',()=>({Dock:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock('../../../src/ui/v7/components',()=>({
 Sheet:({open,children,footer,onClose}:any)=>open?<section><button onClick={onClose}>Close editor</button>{children}{footer}</section>:null,
 Button:({children,onClick,disabled}:any)=><button onClick={onClick} disabled={disabled}>{children}</button>,
 Picker:()=>null,IconButton:()=>null,Skeleton:()=>null,StatTile:()=>null,
}));
const original:CardDetail['note']={noteId:'note-a',noteNo:1,version:1,front:'Question A',back:'Draft A',type:'basic',kind:'proof',tags:[],
 status:'active',origin:'user',projectSlug:'proofs',checkpointCode:null,sessionNumber:null,sourceShort:null,pageLabel:null};
let host:HTMLDivElement,root:Root;
const render=(selectedNo:number)=>act(async()=>root.render(<MemoryRouter><CardV7 selectedNo={selectedNo}/></MemoryRouter>));
const click=(text:string)=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text)!.click();});
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 f.save.mockReset().mockResolvedValue(undefined);f.notify.mockReset();
 f.details={1:{note:original,cards:[],history:[],comments:[]},2:{note:{...original,noteId:'note-b',noteNo:2,front:'Question B',back:'Proof B'},cards:[],history:[],comments:[]}};
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('never sends the old card draft to a new cached selection with the same version',async()=>{
 await render(1);await click('Edit card');await render(2);await click('Save changes');
 expect(f.save).not.toHaveBeenCalled();
 expect(f.notify).toHaveBeenCalledWith(expect.stringMatching(/selected card changed/i),{tone:'danger'});
 expect([...host.querySelectorAll('textarea')].some(field=>field.value==='Draft A')).toBe(true);
 await click('Close editor');await click('Edit card');await click('Save changes');
 expect(f.save).toHaveBeenCalledWith({noteNo:2,expectedNoteId:'note-b',expectedVersion:1,
  patch:{front:'Question B',back:'Proof B',type:'basic',kind:'proof',tags:[]}});
});
