import {memo,useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUp,Camera,ChevronDown,ChevronUp,Ellipsis,Hand,ImagePlus,Minus,Pencil,Plus,Redo2,ScanText,Trash2,Undo2,Maximize2,Minimize2} from 'lucide-react';
import {Button,IconButton,Sheet} from '../../ui/v7/components';
import {InkCanvas,type InkCanvasHandle} from '../../ui/v7/ink/InkCanvas';
import {PaperEraserControl,PencilOnlyControl,usePaperInput} from './PaperInputTools';
import {FullscreenPaper} from './FullscreenPaper';
import {clearPadInk,initializePadInk,replacePadStrokes,undoPadInk,type PadInkHistory,type PadStrokes} from '../../ui/v7/ink/ink';
import {rasterizeInk,reencodePhoto} from '../../ui/v7/ink/images';
import {TUTOR_ATTACHMENT_COUNT,type TutorAttachment,type TutorDrawingInk,type TutorImageDraft} from '../../data/tutor/attachment-types';
import {assertTutorInkScope,editInkDraft,emptyInk,finishStagedDrawing,keepDraftImage,readInkDraft,readTutorImage,writeInkDraft,
  type InkDraft,type InkRecovery,type TutorInkScope} from '../../data/tutor/ink-storage';
import {MathText} from '../../ui/MathText';
import {EQUATION_MODEL,EQUATION_MODEL_BYTES} from './input/equationModel';
import {equationModelCached,recognizeEquation} from './input/equationRecognizer';
import './scratchpad.css';

const openingInk:InkRecovery={draft:emptyInk,status:'loading'};
export function useTutorInk(scope:TutorInkScope,enabled:boolean) {
  const [recovery,setRecovery] = useState(openingInk);
  const [error,setError] = useState('');
  const latest=useRef(openingInk), pending=useRef<Promise<unknown>>(Promise.resolve());
  const mounted=useRef<{scope:TutorInkScope}|null>(null),readAttempt=useRef(0);
  const publish=useCallback((value:InkRecovery)=>{
    latest.current=value;
    setRecovery(value);
  },[]);
  const retry=useCallback(()=>{
    const binding=mounted.current;
    if(!enabled||binding?.scope!==scope)return;
    const attempt=++readAttempt.current;
    const current=()=>mounted.current===binding&&readAttempt.current===attempt;
    publish({draft:latest.current.draft,status:'loading'});
    void pending.current.catch(()=>{}).then(()=>current()?readInkDraft(scope):undefined).then(draft=>{
      if(current()&&draft)publish({draft,status:'ready'});
    }).catch(()=>{if(current())publish({...latest.current,status:'failed'});});
  },[enabled,publish,scope]);
  useLayoutEffect(()=>{
    if(!enabled)return;
    mounted.current={scope};
    latest.current=openingInk;
    retry();
    return ()=>{mounted.current=null;};
  },[scope,enabled,retry]);
  const update=useCallback(async (change:InkDraft|((draft:InkDraft)=>InkDraft))=>{
    const binding=mounted.current, current=latest.current;
    assertTutorInkScope(scope);
    if(!enabled||binding?.scope!==scope||current.status!=='ready')throw new Error('Reopen the saved images first.');
    const next=typeof change==='function'?change(current.draft):change;
    if(next===current.draft)return pending.current;
    publish({draft:next,status:'ready'});
    pending.current=pending.current.catch(()=>{}).then(()=>writeInkDraft(scope,next));
    try {
      await pending.current;
      if(mounted.current===binding)setError('');
    } catch(error) {
      if(mounted.current===binding)setError('The drawing is open here. This device could not save it.');
      throw error;
    }
  },[enabled,publish,scope]);
  const snapshot=useCallback(()=>enabled&&mounted.current?.scope===scope?latest.current:openingInk,[enabled,scope]);
  const continueWithText=useCallback(()=>{
    const current=snapshot();
    if(current.status==='failed')publish({...current,textOnly:true});
  },[publish,snapshot]);
  return useMemo(()=>({...recovery,snapshot,retry,continueWithText,update,error,ready:recovery.status==='ready'}),
    [recovery,snapshot,retry,continueWithText,update,error]);
}
export type TutorInkState=ReturnType<typeof useTutorInk>;

export function needsTutorInkMigration(draft?:InkDraft):boolean {
  return Boolean(draft&&!draft.inlineImages&&(draft.photos.length||draft.strokes.length));
}

export const TutorInkTray=memo(function TutorInkTray({ink,shown,photoActions,photoDisabled,onPickPhoto,onInsertImage,onCloseDrawing,onInsertEquation,leading,
  onMigrateImages,editingImageId,referencedImageIds,canInsertImage,canMigrate,answerLength}: {
  ink:TutorInkState;shown:boolean;photoActions:HTMLElement|null;photoDisabled:boolean;onPickPhoto:()=>void;
  onInsertImage:(id:string,replacesId?:string)=>boolean;onCloseDrawing:()=>void;
  /** N221: insert recognised LaTeX at the answer's caret. */
  onInsertEquation?:(latex:string)=>boolean;
  /** N221 (Owner): the way back to the keys, at the left end of the scratch pad's one row of tools. */
  leading?:ReactNode;
  onMigrateImages:(ids:string[])=>boolean;editingImageId:string|null;referencedImageIds:readonly string[];
  canInsertImage:boolean;canMigrate:boolean;answerLength:number;
}) {
  const {draft}=ink;
  const editingAsset=draft.photos.find(image=>image.id===editingImageId);
  const working=editingImageId&&draft.editingDrawing?.id===editingImageId
    ? draft.editingDrawing : editingAsset?.ink??draft;
  const [history,setHistory]=useState<PadInkHistory>(()=>initializePadInk(working.strokes)??initializePadInk()!);
  const [redo,setRedo]=useState<readonly PadStrokes[]>([]);
  const [mode,setMode]=useState<'pen'|'eraser'|'hand'>('pen');
  const [toolsOpen,setToolsOpen]=useState(false);
  const [preview,setPreview]=useState('');
  const [height,setHeight]=useState<number>();
  const paper=useRef<HTMLDivElement>(null);
  const resize=useRef<{pointer:number;y:number;height:number}|null>(null);
  const paperId=useId(), hintId=useId();
  const paperOffset=useRef(0);
  const paperLeft=useRef(0);
  const [paperHeight,setPaperHeight]=useState(0);
  const [full,setFull]=useState(false)
  /** N228 (Owner): the scratch pad fills the screen. */
  const input=usePaperInput();
  const canvas=useRef<InkCanvasHandle>(null);
  const [pendingDot,setPendingDot]=useState(false);
  const flushDot=()=>canvas.current?.flushPendingDot()??history;
  const [fullscreen,setFullscreen]=useState(false)
  const [started,setStarted]=useState(false),[error,setError]=useState(''),[preparing,setPreparing]=useState(false);
  const pending=useRef(false),migration=useRef(false);
  const lastMigration=useRef<{draft:InkDraft;answerLength:number}|undefined>(undefined);
  const picker=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null);
  const strokes=useRef(working.strokes);
  const refs=useRef(referencedImageIds);
  refs.current=referencedImageIds;
  const editingId=useRef(editingImageId);
  editingId.current=editingImageId;
  const insertable=useRef(canInsertImage);
  insertable.current=canInsertImage;
  const migrateImages=useRef(onMigrateImages);
  migrateImages.current=onMigrateImages;
  const legacy=needsTutorInkMigration(draft);
  // N221 (Owner): handwritten equation recognition (Pix2Text MFR, on this device after a one-time download).
  type Reading={phase:'ask'|'download'|'reading'|'result'|'error';loaded?:number;latex?:string;message?:string};
  const [reading,setReading]=useState<Reading|null>(null);
  const readingRun=useRef(0);
  async function readEquation(){
    const source=flushDot().strokes;
    const run=++readingRun.current;
    const cached=await equationModelCached().catch(()=>false);
    if(run!==readingRun.current)return;
    setReading({phase:cached?'reading':'download',loaded:0});
    try{
      const latex=await recognizeEquation(source,working.width,loaded=>{
        if(run===readingRun.current)setReading(current=>current&&current.phase==='download'?{...current,loaded}:current);
      });
      if(run===readingRun.current)setReading({phase:'result',latex});
    }catch(error){
      if(run===readingRun.current)setReading({phase:'error',message:error instanceof Error?error.message:'Recognition failed.'});
    }
  }
  async function openReading(){
    flushDot();
    const run=++readingRun.current;
    setReading({phase:'reading'});
    const cached=await equationModelCached().catch(()=>false);
    if(run!==readingRun.current)return;
    if(cached)void readEquation();else setReading({phase:'ask'});
  }
  function closeReading(){readingRun.current++;setReading(null);}
  const megabytes=Math.round(EQUATION_MODEL_BYTES/1e6);

  useEffect(()=>{
    if (strokes.current===working.strokes) return;
    strokes.current=working.strokes;
    setHistory(initializePadInk(working.strokes)??initializePadInk()!);
    setRedo([]);
  },[working.strokes]);
  useEffect(()=>{
    if (!shown||!editingAsset||editingAsset.ink) return;
    const url=URL.createObjectURL(editingAsset.blob);
    setPreview(url);
    return ()=>{URL.revokeObjectURL(url);setPreview('');};
  },[shown,editingAsset]);
  useEffect(()=>{
    const viewport=paper.current;
    if (!shown || !viewport) {
      setStarted(false);
      return;
    }
    viewport.scrollTop=paperOffset.current;
    viewport.scrollLeft=paperLeft.current;
    const measure=()=>setPaperHeight(Math.round(viewport.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver==='undefined') return;
    const observer=new ResizeObserver(measure);
    observer.observe(viewport);
    return ()=>observer.disconnect();
  },[shown,editingImageId]);

  useEffect(()=>{
    if(!ink.ready||!legacy||!canMigrate||draft.queuedText!==undefined||migration.current)return;
    if(lastMigration.current?.draft===draft&&lastMigration.current.answerLength===answerLength)return;
    lastMigration.current={draft,answerLength};
    migration.current=true;
    const insertMigrated=migrateImages.current;
    const migrate=async()=>{
      const drawingId=draft.drawingId??crypto.randomUUID();
      const savedDrawing=draft.photos.find(image=>image.id===drawingId);
      const legacyDrawing=draft.strokes.length&&!savedDrawing
        ? {id:drawingId,kind:'drawing' as const,mimeType:'image/png' as const,
            blob:await rasterizeInk(draft.strokes,draft.width,draft.accent),
            ink:{strokes:draft.strokes,width:draft.width,accent:draft.accent}}
        : undefined;
      const staged=legacyDrawing?{...draft,drawingId,photos:[...draft.photos,legacyDrawing]}:draft;
      let accepted=false;
      try{
        await ink.update(current=>{
          accepted=current===draft;
          return accepted?staged:current;
        });
      }catch(error){
        if(staged!==draft){
          lastMigration.current={draft,answerLength};
          void ink.update(current=>current===staged?draft:current).catch(()=>{});
        }
        throw error;
      }
      if(!accepted)return;
      lastMigration.current={draft:staged,answerLength};
      if(!insertMigrated(staged.photos.map(image=>image.id))){
        setError('Shorten the answer to restore your images.');
        return;
      }
      setError('');
      await ink.update(current=>current===staged
        ? {...current,inlineImages:true,strokes:[],drawingId:undefined}
        : current).catch(()=>{});
    };
    void migrate().catch(()=>setError('Your drawings are still saved. Reopen this conversation to try restoring their references.'))
      .finally(()=>{migration.current=false;});
  },[draft,ink.ready,legacy,canMigrate,answerLength]);

  useEffect(()=>{
    const staged=draft.stagedDrawing;
    if(!ink.ready||pending.current||!staged||!referencedImageIds.includes(staged.id))return;
    void ink.update(current=>finishStagedDrawing(current,staged.id)).catch(()=>{});
  },[draft.stagedDrawing,ink.ready,referencedImageIds]);

  const queued=draft.queuedText!==undefined;
  const count=new Set(referencedImageIds).size;
  const canDraw=ink.ready&&!queued&&!legacy&&(editingImageId!==null?Boolean(editingAsset?.ink):count<TUTOR_ATTACHMENT_COUNT);
  function edit(change:(draft:InkDraft)=>InkDraft) {
    return ink.update(current=>editInkDraft(current,change,refs.current));
  }
  function editWorking(change:Partial<TutorDrawingInk>) {
    void edit(current=>editingImageId
      ? {...current,editingDrawing:{id:editingImageId,strokes:working.strokes,width:working.width,accent:working.accent,...change}}
      : {...current,...change,inlineImages:true,drawingId:undefined}).catch(()=>{});
  }
  function saveInk(next:PadInkHistory,forward:readonly PadStrokes[]=[]) {
    setStarted(false);
    if(next===history||!canDraw||pending.current)return;
    strokes.current=next.strokes;
    setHistory(next);
    setRedo(forward);
    editWorking({strokes:next.strokes});
  }

  async function prepare(action:()=>Promise<void>,failure:string) {
    if(pending.current)return;
    pending.current=true;
    setPreparing(true);
    setError('');
    try{await action();}catch{setError(failure);}finally{pending.current=false;setPreparing(false);}
  }
  function rollbackImage(id:string) {
    void ink.update(current=>({...current,photos:current.photos.filter(image=>image.id!==id),
      ...(current.stagedDrawing?.id===id?{stagedDrawing:undefined}:{})})).catch(()=>{});
  }
  async function photo(file:File) {
    if(!ink.ready||legacy||queued||!canInsertImage||count>=TUTOR_ATTACHMENT_COUNT)return;
    await prepare(async()=>{
      const blob=await reencodePhoto(file);
      const image:TutorImageDraft={id:crypto.randomUUID(),kind:'photo',mimeType:'image/jpeg',blob};
      let inserted=false;
      try{
        await edit(current=>{
          if(!insertable.current||new Set(refs.current).size+Number(current.strokes.length>0)>=TUTOR_ATTACHMENT_COUNT)return current;
          inserted=true;
          return {...current,inlineImages:true,photos:keepDraftImage(current,image,refs.current)};
        });
      }catch(error){if(inserted)rollbackImage(image.id);throw error;}
      if(!inserted){setError('This answer could not accept another image.');return;}
      if(!onInsertImage(image.id))rollbackImage(image.id);
    },'Could not add that photo.');
  }
  async function insertDrawing() {
    if(!canDraw||started||(!editingImageId&&!canInsertImage))return;
    const source=flushDot().strokes;
    if(!source.length)return;
    await prepare(async()=>{
      const vector={strokes:source,width:working.width,accent:working.accent};
      const blob=await rasterizeInk(vector.strokes,vector.width,vector.accent);
      const image:TutorImageDraft={id:crypto.randomUUID(),kind:'drawing',mimeType:'image/png',blob,ink:vector};
      let inserted=false;
      try{
        await edit(current=>{
          if(editingId.current!==editingImageId)return current;
          if(editingImageId?!refs.current.includes(editingImageId):!insertable.current||new Set(refs.current).size>=TUTOR_ATTACHMENT_COUNT)return current;
          inserted=true;
          return {...current,inlineImages:true,stagedDrawing:{id:image.id,replacesId:editingImageId??undefined},
            photos:keepDraftImage(current,image,refs.current)};
        });
      }catch(error){if(inserted)rollbackImage(image.id);throw error;}
      if(!inserted)return;
      if(!onInsertImage(image.id,editingImageId??undefined)){rollbackImage(image.id);return;}
      paperOffset.current=0;
      paperLeft.current=0;
      setMode('pen');
      await ink.update(current=>finishStagedDrawing(current,image.id)).catch(()=>{});
    },'Could not save the image on this device. Your drawing is still here. Try Insert drawing again.');
  }
  function size(next:number) {
    const viewport=window.visualViewport?.height??window.innerHeight;
    setHeight(Math.max(96,Math.min(next,viewport*.48,512)));
  }
  function nudge(delta:number) {
    if (paper.current) size(paper.current.getBoundingClientRect().height+delta);
  }
  function redoStroke() {
    const next=redo.at(-1);
    if (next) saveInk(replacePadStrokes(history,next),redo.slice(0,-1));
  }
  function discardDrawing() {
    canvas.current?.discardPendingDot();
    void edit(current=>editingImageId
      ? {...current,editingDrawing:undefined}
      : {...current,strokes:[],drawingId:undefined}).catch(()=>{});
    paperOffset.current=0;
    paperLeft.current=0;
    setToolsOpen(false);
    onCloseDrawing();
  }
  const pad=shown&&(!editingAsset||editingAsset.ink)&&<section className="tutor-scratchpad" aria-label="Scratch pad" data-fullscreen={fullscreen||undefined}
    style={{'--scratch-height':height===undefined?undefined:height+'px'} as CSSProperties}>
    <div className="tutor-ink-tools" role="group" aria-label="Drawing tools">
      {leading}
      <IconButton label="Pen" disabled={!canDraw||preparing} aria-pressed={mode==='pen'} onClick={()=>setMode('pen')}><Pencil aria-hidden="true"/></IconButton>
      <PaperEraserControl kind={input.eraserKind} active={mode==='eraser'} disabled={!canDraw||preparing}
        onSelect={()=>setMode('eraser')} onKind={input.setEraserKind}/>
      {input.isIPad&&<PencilOnlyControl enabled={input.enabled} onToggle={input.toggle}/>}
      <IconButton label="Hand" aria-pressed={mode==='hand'} onClick={()=>setMode('hand')}><Hand aria-hidden="true"/></IconButton>
      <IconButton label="Undo stroke" disabled={!canDraw||preparing||(!history.undo.length&&!pendingDot)} onClick={()=>{const current=flushDot();saveInk(undoPadInk(current),[...(pendingDot?[]:redo),current.strokes]);}}><Undo2 aria-hidden="true"/></IconButton>
      <IconButton label="Recognize equation" aria-haspopup="dialog" disabled={preparing||(!working.strokes.length&&!pendingDot)||!onInsertEquation}
        onClick={()=>{void openReading();}}><ScanText aria-hidden="true"/></IconButton>
      <IconButton label="Scratch pad actions" aria-haspopup="dialog" onClick={()=>setToolsOpen(true)}><Ellipsis aria-hidden="true"/></IconButton>
      <IconButton label={editingImageId?'Update drawing':'Insert drawing'} className="tutor-insert-drawing"
        disabled={!canDraw||preparing||started||(!working.strokes.length&&!pendingDot)||(!editingImageId&&!canInsertImage)}
        onClick={()=>{void insertDrawing();}}><ArrowUp aria-hidden="true"/></IconButton>
    </div>
    {/* N221 (Owner): below the one row of tools, the rest is paper. It is wider and taller than the pad and scrolls
        both ways with the Hand; the resize grip sits on its top edge and the hint inside it, so neither takes a row. */}
    <div className="tutor-scratch-sheet">
      <button type="button" className="tutor-paper-expand" aria-label={fullscreen?'Exit full screen':'Full screen'} title={fullscreen?'Exit full screen':'Full screen'}
        data-fullscreen-toggle="" aria-pressed={fullscreen} onClick={()=>{flushDot();setFullscreen(on=>!on);}}
      >{fullscreen?<Minimize2 aria-hidden="true"/>:<Maximize2 aria-hidden="true"/>}</button>
      <div className="tutor-scratch-resize" role="separator" tabIndex={0} aria-label="Resize scratch pad"
        aria-orientation="horizontal" aria-controls={paperId} aria-valuenow={Math.round(paperHeight/window.innerHeight*100)}
        aria-valuetext={paperHeight+' pixels'}
        onPointerDown={event=>{
          if (event.button!==0 || !paper.current) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          resize.current={pointer:event.pointerId,y:event.clientY,height:paper.current.getBoundingClientRect().height};
        }}
        onPointerMove={event=>{
          const drag=resize.current;
          if (drag?.pointer===event.pointerId) size(drag.height+drag.y-event.clientY);
        }}
        onLostPointerCapture={()=>{resize.current=null;}}
        onKeyDown={event=>{
          switch (event.key) {
            case 'ArrowUp': nudge(32); break;
            case 'ArrowDown': nudge(-32); break;
            case 'Home': size(0); break;
            case 'End': size(Number.POSITIVE_INFINITY); break;
            default:return;
          }
          event.preventDefault();
        }}><span aria-hidden="true"/></div>
    <div ref={paper} id={paperId} className="tutor-scratch-paper" role="region" aria-label="Drawing paper" aria-describedby={hintId}
      tabIndex={0} onScroll={event=>{paperOffset.current=event.currentTarget.scrollTop;paperLeft.current=event.currentTarget.scrollLeft;}}>
      <InkCanvas apiRef={canvas} onPendingDot={setPendingDot} pencilOnly={input.isIPad&&input.enabled} pencilTipEraser={input.isIPad} eraserKind={input.eraserKind} history={history} onChange={saveInk} onStroke={()=>{setStarted(true);setFull(false)}} onStrokeEnd={()=>setStarted(false)} onFull={()=>setFull(true)}
        panTouches={2} onPan={(dx,dy,gesture,fingers)=>{
          const viewport=paper.current;
          if (gesture==='touch'&&fingers&&fingers>=3&&!fullscreen) {
            const chat=viewport?.closest('.lemma-tutor')?.querySelector<HTMLElement>('[role="log"]');
            if(chat)chat.scrollTop-=dy;
          } else if(viewport) {
            viewport.scrollLeft-=dx;
            viewport.scrollTop-=dy;
          }
        }} mode={canDraw&&!preparing?mode:'hand'} width={working.width} accent={working.accent} label="Draw your answer"/>
    </div>
    <p id={hintId} className="tutor-scratch-hint">Two fingers to move paper · Three to scroll chat</p>
    </div>
    {full&&<p role="status" className="composer-status">The drawing is full. Insert it, or clear it, to keep drawing.</p>}
    {!editingImageId&&!canInsertImage&&<p role="status" className="composer-status">Shorten the answer to insert another image.</p>}
  </section>;
  return <>
    {pad&&<FullscreenPaper active={fullscreen} onExit={()=>{flushDot();setFullscreen(false);}} label="Scratch pad, full screen">{pad}</FullscreenPaper>}
    <Sheet open={Boolean(reading)&&shown} onClose={closeReading} title="Recognize equation">
      <div className="tutor-equation-reading" aria-live="polite">
        {reading?.phase==='ask'&&<>
          <p>Lemma reads your handwriting on this device with {EQUATION_MODEL.name} ({EQUATION_MODEL.license} licence). It downloads
            the model once, about {megabytes} MB, and works offline after that.</p>
          <div className="tutor-session-actions">
            <Button variant="primary" onClick={()=>{void readEquation();}}>Download and recognize</Button>
            <Button onClick={closeReading}>Not now</Button>
          </div>
        </>}
        {reading?.phase==='download'&&<>
          <p>Downloading the model, {Math.round((reading.loaded??0)/1e6)} of {megabytes} MB…</p>
          <progress max={EQUATION_MODEL_BYTES} value={reading.loaded??0} aria-label="Model download"/>
        </>}
        {reading?.phase==='reading'&&<p role="status">Reading your handwriting…</p>}
        {reading?.phase==='result'&&<>
          <div className="tutor-equation-preview"><MathText source={'$'+(reading.latex??'')+'$'}/></div>
          <label className="tutor-equation-latex">LaTeX
            <textarea rows={2} value={reading.latex??''} spellCheck={false} autoCapitalize="off"
              onChange={event=>setReading({phase:'result',latex:event.target.value})}/>
          </label>
          <div className="tutor-session-actions">
            <Button variant="primary" disabled={!reading.latex?.trim()} onClick={()=>{
              if(onInsertEquation?.(reading.latex!.trim()))closeReading();
            }}>Insert into answer</Button>
            <Button onClick={()=>{void readEquation();}}>Read again</Button>
          </div>
        </>}
        {reading?.phase==='error'&&<>
          <p role="alert">{reading.message} Your drawing is still here.</p>
          <div className="tutor-session-actions">
            <Button variant="primary" onClick={()=>{void readEquation();}}>Try again</Button>
            <Button onClick={closeReading}>Not now</Button>
          </div>
        </>}
      </div>
    </Sheet>
    <Sheet open={toolsOpen&&shown} onClose={()=>setToolsOpen(false)} title="Scratch pad actions">
      {toolsOpen&&shown&&<>
      <div className="tutor-session-actions">
        <Button small disabled={!canDraw||preparing||pendingDot||!redo.length} onClick={()=>{redoStroke();setToolsOpen(false);}}><Redo2 aria-hidden="true"/>Redo stroke</Button>
        <Button small disabled={!canDraw||preparing||(!history.strokes.length&&!pendingDot)} onClick={()=>{const current=flushDot();saveInk(clearPadInk(current));setToolsOpen(false);}}><Trash2 aria-hidden="true"/>Clear scratch pad</Button>
        {editingImageId?draft.editingDrawing?.id===editingImageId&&
          <Button small disabled={queued||preparing} onClick={discardDrawing}>Discard drawing edits</Button>
          :draft.strokes.length>0&&<Button small disabled={queued||preparing} onClick={discardDrawing}>Discard uninserted drawing</Button>}
        <Button small onClick={()=>{nudge(-64);setToolsOpen(false);}}><ChevronDown aria-hidden="true"/>Make scratch pad smaller</Button>
        <Button small onClick={()=>{nudge(64);setToolsOpen(false);}}><ChevronUp aria-hidden="true"/>Expand scratch pad</Button>
      </div>
      <div className="tutor-ink-settings" role="group" aria-label="Pen settings">
        {[2,3,4,7].map(width=><button className="v7-filter-chip" key={width} type="button" aria-label={'Pen width '+width}
          aria-pressed={working.width===width} disabled={!canDraw||preparing} onClick={()=>editWorking({width})}><span style={{inlineSize:width+3,blockSize:width+3}}/></button>)}
        <button className="v7-filter-chip" type="button" aria-pressed={working.accent} disabled={!canDraw||preparing} onClick={()=>editWorking({accent:!working.accent})}>Accent</button>
      </div>
      {count>=TUTOR_ATTACHMENT_COUNT&&<p>Up to three images per answer.</p>}
      </>}
    </Sheet>
    {shown&&preview&&editingAsset&&!editingAsset.ink&&<Sheet open title={editingAsset.kind==='photo'?'Photo':'Drawing'} onClose={onCloseDrawing}>
      <div className="tutor-image-view"><img src={preview} alt={editingAsset.kind==='photo'?'Photo':'Drawing'}/></div>
    </Sheet>}
    <input ref={picker} type="file" accept="image/*" hidden aria-label="Choose photo file" onChange={event=>{
      const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void photo(file);
    }}/>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take photo file" onChange={event=>{
      const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void photo(file);
    }}/>
    {photoActions&&createPortal(<>
      <IconButton label="Upload image" disabled={photoDisabled||!ink.ready||queued||preparing||!canInsertImage||count>=TUTOR_ATTACHMENT_COUNT}
        onPointerDown={event=>event.preventDefault()} onClick={()=>{onPickPhoto();picker.current?.click();}}><ImagePlus aria-hidden="true"/></IconButton>
      <IconButton label="Take photo" disabled={photoDisabled||!ink.ready||queued||preparing||!canInsertImage||count>=TUTOR_ATTACHMENT_COUNT}
        onPointerDown={event=>event.preventDefault()} onClick={()=>{onPickPhoto();camera.current?.click();}}><Camera aria-hidden="true"/></IconButton>
    </>,photoActions)}
    {(error||ink.error)&&<p role="alert" className="composer-status">{error||ink.error}</p>}
  </>;
});

export function TutorImage({owner,attachment,label:customLabel}: {owner:string;attachment:TutorAttachment;label?:string}) {
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
  const label=customLabel??(attachment.kind==='drawing'?'Drawing':'Photo');
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
