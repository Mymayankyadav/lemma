import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Editor} from '../../../src/features/cards/Editor';
import {CardEditorSheet} from '../../../src/features/cards/v7/CardEditorSheet';
import type {CardDetail} from '../../../src/data/types';

vi.mock('../../../src/data/hooks',()=>({useProjects:()=>({data:[]}),useSettings:()=>({data:{macros:''}}),useProject:()=>({data:{checkpoints:[]}})}));
vi.mock('../../../src/app/v7/useMinWidth',()=>({useMinWidth:()=>false}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>false}));
vi.mock('../../../src/ui/MathText',()=>({MathText:()=>null}));
vi.mock('../../../src/ui/MathPreview',()=>({MathPreview:()=>null}));
vi.mock('../../../src/ui/v7/components',()=>({
 Sheet:({children,footer}:any)=><div>{children}{footer}</div>,
 Button:({children,onClick}:any)=><button onClick={onClick}>{children}</button>,
 Picker:()=>null,
}));
const original:CardDetail['note']={noteId:'note',noteNo:1,version:1,front:'Question',back:'Draft',type:'basic',kind:'proof',tags:['original'],
 status:'active',origin:'user',projectSlug:'proofs',checkpointCode:null,sessionNumber:null,sourceShort:null,pageLabel:null};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it.each(['legacy','v7'])('%s retains the opened note version across a query refresh',async mode=>{
 const save=vi.fn();
 const render=(initial:CardDetail['note'])=>mode==='legacy'?<Editor initial={initial} busy={false} onSubmit={save}/>:
  <CardEditorSheet open initial={initial} busy={false} onClose={()=>{}} onSubmit={save}/>;
 await act(async()=>root.render(render(original)));
 await act(async()=>root.render(render({...original,version:2,back:'Proof from another device',tags:['newer']})));
 await act(async()=>{
  if(mode==='legacy')host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  else [...host.querySelectorAll('button')].find(button=>button.textContent==='Save changes')!.click();
 });
 expect(save).toHaveBeenCalledOnce();
 expect(save.mock.calls[0][0]).toMatchObject({noteNo:1,noteId:'note',expectedVersion:1,back:'Draft',tags:['original']});
});
it.each(['legacy','v7'])('%s keeps the note identity with the draft when selection props change',async mode=>{
 const save=vi.fn();
 const render=(initial:CardDetail['note'])=>mode==='legacy'?<Editor initial={initial} busy={false} onSubmit={save}/>:
  <CardEditorSheet open initial={initial} busy={false} onClose={()=>{}} onSubmit={save}/>;
 await act(async()=>root.render(render(original)));
 await act(async()=>root.render(render({...original,noteId:'other-note',noteNo:2,back:'Other proof'})));
 await act(async()=>{
  if(mode==='legacy')host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  else [...host.querySelectorAll('button')].find(button=>button.textContent==='Save changes')!.click();
 });
 expect(save.mock.calls[0][0]).toMatchObject({noteNo:1,noteId:'note',expectedVersion:1,back:'Draft'});
});
