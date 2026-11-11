import {useMemo,useRef,useState} from 'react';
import {useProject,useProjects,useSettings} from '../../../data/hooks';
import type {CardDetail,NoteKind,NoteType} from '../../../data/types';
import {Button,Picker,Segmented,Sheet} from '../../../ui/v7/components';
import {MathText} from '../../../ui/MathText';
import {cardTypeText,noteKindText} from '../../../lib/labels';
import {useMinWidth} from '../../../app/v7/useMinWidth';
import type {EditorValue} from '../Editor';
import {insertAt,macroKeys,symbolKeys} from './editorModel';
import './cards.css';

const types:NoteType[]=['basic','cloze','reverse'];
const kinds:NoteKind[]=['definition','theorem','why','example','counterexample','proof','other'];

function CheckpointPicker({slug,value,onChange}:{slug:string;value:string;onChange:(code:string)=>void}){
 const project=useProject(slug);
 const rows=(project.data?.checkpoints??[]).filter(cp=>cp.ui!=='proposed');
 const label=(code:string)=>{const cp=rows.find(row=>row.code===code);return cp?cp.code+' · '+cp.title:'No checkpoint';};
 return <Picker label="Checkpoint" optional value={label(value)} options={['No checkpoint',...rows.map(cp=>cp.code+' · '+cp.title)]}
  disabled={!slug||project.isPending} disabledReason={!slug?'Choose a path first':undefined}
  onChange={choice=>onChange(rows.find(cp=>cp.code+' · '+cp.title===choice)?.code??'')}/>;
}

/** PLAN §6.11 Editor: a full-height sheet, Write · Preview (side by side on desktop), Front and Back in Reading, a key row
 *  with the owner's macros and common symbols, pickers for Path, Checkpoint, Type and Kind, and the primary in the footer
 *  (the sheet footer stays above the keyboard). */
export function CardEditorSheet({open,onClose,initial,busy,onSubmit}:{open:boolean;onClose:()=>void;initial?:CardDetail['note'];busy:boolean;onSubmit:(value:EditorValue)=>void}){
 const projects=useProjects(),settings=useSettings(),wide=useMinWidth(700);
 const [front,setFront]=useState(initial?.front??''),[back,setBack]=useState(initial?.back??'');
 const [type,setType]=useState<NoteType>(initial?.type??'basic'),[kind,setKind]=useState<NoteKind>(initial?.kind??'other');
 const [slug,setSlug]=useState(initial?.projectSlug??''),[checkpoint,setCheckpoint]=useState(initial?.checkpointCode??'');
 const [mode,setMode]=useState<'Write'|'Preview'>('Write'),[error,setError]=useState('');
 const target=useRef<'front'|'back'>('front'),frontRef=useRef<HTMLTextAreaElement>(null),backRef=useRef<HTMLTextAreaElement>(null);
 const paths=useMemo(()=>(projects.data??[]).filter(row=>!row.system&&row.status!=='archived'),[projects.data]);
 const keys=useMemo(()=>[...macroKeys(settings.data?.macros??''),...symbolKeys],[settings.data?.macros]);
 const creating=!initial,pathTitle=paths.find(row=>row.slug===slug)?.title??'';
 function key(text:string){
  const field=target.current==='front'?frontRef.current:backRef.current;
  const value=target.current==='front'?front:back,set=target.current==='front'?setFront:setBack;
  const at=field?.selectionStart??value.length,end=field?.selectionEnd??at;
  const next=insertAt(value,at,end,text);set(next.value);
  requestAnimationFrame(()=>{field?.focus();field?.setSelectionRange(next.caret,next.caret);});
 }
 function submit(){
  if(!front.trim()||!back.trim()){setError('Write both a front and a back.');return;}
  if(creating&&!slug){setError('Choose a path for this card.');return;}
  setError('');
  onSubmit({front:front.trim(),back:back.trim(),type,kind,projectSlug:slug,checkpointCode:checkpoint||undefined,tags:initial?.tags??[]});
 }
 const write=<div className="v7-editor-write">
  <label className="v7-field-group"><span>Front</span><textarea ref={frontRef} className="v7-field v7-editor-text" rows={3} value={front} onFocus={()=>{target.current='front';}} onChange={event=>setFront(event.target.value)} placeholder="The question, definition or statement"/></label>
  <label className="v7-field-group"><span>Back</span><textarea ref={backRef} className="v7-field v7-editor-text" rows={4} value={back} onFocus={()=>{target.current='back';}} onChange={event=>setBack(event.target.value)} placeholder="The answer, in your own words"/></label>
  <div className="v7-editor-keys" role="toolbar" aria-label="Maths keys">{keys.map(item=><button key={item.label} type="button" className="v7-editor-key" aria-label={'Insert '+item.name}
   onPointerDown={event=>event.preventDefault()} onClick={()=>key(item.insert)}>{item.label}</button>)}</div>
 </div>;
 const preview=<div className="v7-editor-preview" aria-label="Preview">
  <p className="v7-eyebrow">{noteKindText(kind)}</p>
  <div className="v7-editor-front">{front.trim()?<MathText source={front}/>:<span className="v7-meta">The front appears here.</span>}</div>
  <hr/>
  <div className="v7-editor-back">{back.trim()?<MathText source={back}/>:<span className="v7-meta">The back appears here.</span>}</div>
 </div>;
 return <Sheet open={open} onClose={onClose} full title={creating?'New card':'Edit card'}
  footer={<Button variant="primary" loading={busy} onClick={submit}>{creating?'Create card':'Save changes'}</Button>}>
  <div className="v7-editor">
   {!wide&&<Segmented label="Editor view" options={['Write','Preview']} value={mode} onChange={value=>setMode(value as 'Write'|'Preview')}/>}
   {wide?<div className="v7-editor-split">{write}{preview}</div>:mode==='Write'?write:preview}
   <div className="v7-editor-pickers">
    {creating?<Picker label="Path" value={pathTitle||'Choose a path'} options={paths.map(row=>row.title)}
     onChange={title=>{const row=paths.find(item=>item.title===title);setSlug(row?.slug??'');setCheckpoint('');}}/>
     :<p className="v7-meta">{'Path · '+(pathTitle||initial?.projectSlug)}</p>}
    {creating&&<CheckpointPicker key={slug} slug={slug} value={checkpoint} onChange={setCheckpoint}/>}
    <Picker label="Type" value={cardTypeText(type)} options={types.map(cardTypeText)} onChange={label=>setType(types.find(item=>cardTypeText(item)===label)??'basic')}/>
    <Picker label="Kind" value={noteKindText(kind)} options={kinds.map(noteKindText)} onChange={label=>setKind(kinds.find(item=>noteKindText(item)===label)??'other')}/>
   </div>
   {error&&<p role="alert" className="v7-error">{error}</p>}
  </div>
 </Sheet>;
}
