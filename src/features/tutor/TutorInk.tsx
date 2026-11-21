import {useEffect,useRef,useState} from 'react';
import {Camera,Expand,Hand,ImagePlus,Minus,Pencil,Plus,Undo2,Eraser,X} from 'lucide-react';
import {Button,IconButton,Sheet} from '../../ui/v7/components';
import {InkCanvas} from '../../ui/v7/ink/InkCanvas';
import {initializePadInk,undoPadInk,type PadInkHistory} from '../../ui/v7/ink/ink';
import {reencodePhoto} from '../../ui/v7/ink/images';
import {TUTOR_ATTACHMENT_COUNT,type TutorAttachment} from '../../data/tutor/attachment-types';
import {emptyInk,readInkDraft,readTutorImage,writeInkDraft,type InkDraft} from '../../data/tutor/ink-storage';

export function useTutorInk(key:string,enabled:boolean) {
  const [draft,setDraft] = useState<InkDraft>(emptyInk);
  const [error,setError] = useState('');
  const latest=useRef(emptyInk), pending=useRef<Promise<unknown>>(Promise.resolve());
  useEffect(()=>{
    if (!enabled) return;
    let active=true;
    void readInkDraft(key).then(value=>{
      if(active){latest.current=value;setDraft(value);}
    }).catch(()=>{if(active)setError('The saved drawing could not be reopened.');});
    return ()=>{active=false;};
  },[key,enabled]);
  function update(change:InkDraft|((draft:InkDraft)=>InkDraft)) {
    const next=typeof change==='function'?change(latest.current):change;
    if(next===latest.current)return pending.current;
    latest.current=next;
    setDraft(next);
    pending.current=pending.current.catch(()=>{}).then(()=>writeInkDraft(key,next));
    return pending.current.catch(error=>{
      setError('The drawing is open here. This device could not save it.');
      throw error;
    });
  }
  return {draft,update,error};
}
export type TutorInkState=ReturnType<typeof useTutorInk>;

export function TutorInkTray({ink,shown,photoOpen,onClosePhoto,onKeys}: {
  ink:TutorInkState;shown:boolean;photoOpen:boolean;onClosePhoto:()=>void;onKeys:()=>void;
}) {
  const [history,setHistory]=useState<PadInkHistory>(()=>initializePadInk(ink.draft.strokes)??initializePadInk()!);
  const [mode,setMode]=useState<'pen'|'eraser'|'hand'>('pen'),[expanded,setExpanded]=useState(false);
  const [started,setStarted]=useState(false),[error,setError]=useState(''),[preparing,setPreparing]=useState(false);
  const picker=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null);
  const {draft}=ink;
  useEffect(()=>{
    if (history.strokes!==draft.strokes) setHistory(initializePadInk(draft.strokes)??initializePadInk()!);
  },[draft.strokes]);
  const drawing=Boolean(draft.strokes.length||started);
  const count=draft.photos.length+Number(drawing);
  function update(change:Partial<InkDraft>) {
    void ink.update(current=>({...current,...change})).catch(()=>{});
  }
  function saveInk(next:PadInkHistory) {
    if (!draft.strokes.length&&draft.photos.length>=TUTOR_ATTACHMENT_COUNT) {
      setError('Remove an image before adding a drawing.');
      setStarted(false);
      return;
    }
    setHistory(next);
    setStarted(false);
    update({strokes:next.strokes,drawingId:undefined});
  }
  async function photo(file:File) {
    if (preparing || count >= TUTOR_ATTACHMENT_COUNT) return;
    setPreparing(true);
    setError('');
    try {
      const blob=await reencodePhoto(file);
      await ink.update(current=>current.photos.length+Number(current.strokes.length>0)>=TUTOR_ATTACHMENT_COUNT
        ? current
        : {...current,photos:[...current.photos,{id:crypto.randomUUID(),kind:'photo',mimeType:'image/jpeg',blob}]});
      onClosePhoto();
    } catch {
      setError('Could not add that photo.');
    } finally {
      setPreparing(false);
    }
  }
  const pad=<>
    <div className="tutor-ink-tools" role="group" aria-label="Drawing tools">
      <IconButton label="Pen" aria-pressed={mode==='pen'} onClick={()=>setMode('pen')}><Pencil aria-hidden="true"/></IconButton>
      {[2,4,7].map(width=><button className="v7-filter-chip" key={width} type="button" aria-label={'Pen width '+width}
        aria-pressed={draft.width===width} onClick={()=>update({width,drawingId:undefined})}><span style={{inlineSize:width+3,blockSize:width+3}}/></button>)}
      <button className="v7-filter-chip" type="button" aria-pressed={draft.accent} onClick={()=>update({accent:!draft.accent,drawingId:undefined})}>Accent</button>
      <IconButton label="Eraser" aria-pressed={mode==='eraser'} onClick={()=>setMode('eraser')}><Eraser aria-hidden="true"/></IconButton>
      <IconButton label="Hand" aria-pressed={mode==='hand'} onClick={()=>setMode('hand')}><Hand aria-hidden="true"/></IconButton>
      <IconButton label="Undo stroke" disabled={!history.undo.length} onClick={()=>saveInk(undoPadInk(history))}><Undo2 aria-hidden="true"/></IconButton>
      {expanded?<Button small onClick={()=>setExpanded(false)}>Done</Button>
        :<><IconButton label="Expand scratch pad" onClick={()=>setExpanded(true)}><Expand aria-hidden="true"/></IconButton><Button small onClick={onKeys}>Keys</Button></>}
    </div>
    <InkCanvas history={history} onChange={saveInk} onStroke={()=>setStarted(true)} mode={mode} width={draft.width}
      accent={draft.accent} label="Draw your answer"/>
  </>;
  return <>
    {count>0&&<div className="tutor-attachment-chips" aria-label="Images for your answer">
      {drawing&&<span className="v7-meta-chip">Drawing <IconButton label="Remove drawing" onClick={()=>{
        const blank=initializePadInk()!;setHistory(blank);setStarted(false);update({strokes:[],drawingId:undefined});
      }}><X aria-hidden="true"/></IconButton></span>}
      {draft.photos.map((item,index)=><span key={item.id} className="v7-meta-chip">Photo {index+1}
        <IconButton label={'Remove photo '+(index+1)} onClick={()=>update({photos:draft.photos.filter(photo=>photo.id!==item.id)})}><X aria-hidden="true"/></IconButton>
      </span>)}
    </div>}
    {shown&&!expanded&&<div className="tutor-ink-pad">{pad}</div>}
    <Sheet open={shown&&expanded} title="Scratch pad" onClose={()=>setExpanded(false)}>{shown&&expanded&&pad}</Sheet>
    <input ref={picker} type="file" accept="image/*" hidden aria-label="Choose photo file" onChange={event=>{
      const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void photo(file);
    }}/>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take photo file" onChange={event=>{
      const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void photo(file);
    }}/>
    <Sheet open={photoOpen} onClose={onClosePhoto} title="Add a photo">
      <Button onClick={()=>camera.current?.click()} disabled={preparing||count>=TUTOR_ATTACHMENT_COUNT}><Camera aria-hidden="true"/>Take photo</Button>
      <Button onClick={()=>picker.current?.click()} disabled={preparing||count>=TUTOR_ATTACHMENT_COUNT}><ImagePlus aria-hidden="true"/>Choose photo</Button>
      {count>=TUTOR_ATTACHMENT_COUNT&&<p>Up to three images per answer.</p>}
      {error&&<p role="alert">{error}</p>}
    </Sheet>
    {(error||ink.error)&&!photoOpen&&<p role="alert" className="composer-status">{ink.error||error}</p>}
  </>;
}

export function TutorImage({owner,attachment}: {owner:string;attachment:TutorAttachment}) {
  const [src,setSrc]=useState(''),[open,setOpen]=useState(false),[error,setError]=useState(false);
  const [zoom,setZoom]=useState(1);
  useEffect(()=>{
    let active=true,url='';
    void readTutorImage(owner,attachment).then(value=>{
      url=value;
      if(active)setSrc(value);
      else if(value.startsWith('blob:')) URL.revokeObjectURL(value);
    }).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;if(url.startsWith('blob:'))URL.revokeObjectURL(url);};
  },[owner,attachment.id,attachment.localData]);
  const label=attachment.kind==='drawing'?'Drawing':'Photo';
  return <>
    <button className="tutor-image-thumb" type="button" aria-label={'View '+label.toLowerCase()} disabled={!src} onClick={()=>setOpen(true)}>
      {src&&<img src={src} alt={label}/>}<span>{error?label+' unavailable':label}</span>
    </button>
    <Sheet open={open} onClose={()=>{setOpen(false);setZoom(1);}} title={label} footer={<>
      <IconButton label="Zoom out" disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-.5))}><Minus aria-hidden="true"/></IconButton>
      <IconButton label="Zoom in" disabled={zoom>=4} onClick={()=>setZoom(value=>Math.min(4,value+.5))}><Plus aria-hidden="true"/></IconButton>
    </>}>
      {open&&src&&<div className="tutor-image-view"><img src={src} alt={label} style={{width:zoom*100+'%'}}/></div>}
    </Sheet>
  </>;
}
