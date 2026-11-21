import {useAtlasDialog} from './useAtlasDialog';
import {useId,useState,type FormEvent} from 'react';
import {Button,Field,Sheet} from '../../../ui/v7/components';

/** Pins are the only Atlas mutations exposed by LemmaApi today.
 * Never write concept hierarchy/links directly from the browser. */
export default function ConceptPin({
 id,name,x,y,onSave,onClose,kit=false,
}:{
 id:string;name:string;x:number|null;y:number|null;
 onSave:(id:string,x:number|null,y:number|null)=>Promise<void>;
 onClose:()=>void;kit?:boolean;
}){
 const dialog=useAtlasDialog();
 const formId=useId();
 const [coordinateX,setCoordinateX]=useState(String(x??0));
 const [coordinateY,setCoordinateY]=useState(String(y??0));
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const pinned=x!==null&&y!==null;
 function parse(){
  if(!coordinateX.trim()||!coordinateY.trim())throw Error('Both coordinates are required.');
  const xx=Number(coordinateX),yy=Number(coordinateY);
  if(!Number.isFinite(xx)||!Number.isFinite(yy))throw Error('Map coordinates must be finite numbers.');
  return {xx,yy};
 }
 async function save(nextX:number|null,nextY:number|null){
  if(busy)return;
  setBusy(true);setError('');
  try{await onSave(id,nextX,nextY);onClose();}
  catch(e){setError(e instanceof Error?e.message:'Map pin could not be saved.');}
  finally{setBusy(false);}
 }
 function submit(e:FormEvent){
  e.preventDefault();
  try{const {xx,yy}=parse();void save(xx,yy);}
  catch(e){setError(e instanceof Error?e.message:'Invalid map coordinates');}
 }
 if(kit)return <Sheet open containFocus title={'Map pin: '+name} focusTitle onClose={()=>{if(!busy)onClose();}}
  footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
   <Button variant="primary" type="submit" form={formId} loading={busy}>Save pin</Button></>}>
  <form id={formId} className="v7-form-stack" onSubmit={submit}>
   <p className="v7-supporting">{pinned?'Pinned at ('+x+', '+y+').':'Not pinned.'} Choose a position for this idea on the map.</p>
   <Field label="X coordinate" aria-label="Map X coordinate" type="number" step="any" required value={coordinateX} disabled={busy} onChange={event=>setCoordinateX(event.target.value)}/>
   <Field label="Y coordinate" aria-label="Map Y coordinate" type="number" step="any" required value={coordinateY} disabled={busy} onChange={event=>setCoordinateY(event.target.value)}/>
   {pinned&&<Button disabled={busy} onClick={()=>void save(null,null)}>Unpin</Button>}
   {error&&<p role="alert" className="v7-error">{error}</p>}
  </form>
 </Sheet>;
 return <dialog {...dialog} aria-label={'Edit map pin for '+name}
  onCancel={e=>{e.preventDefault();if(!busy)onClose()}}
  className="fixed inset-0 z-50 m-auto w-[min(92vw,430px)] rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-lg">
  <h2 className="text-headline font-semibold">Map pin: {name}</h2>
  <p className="mt-1 text-label text-ink-2">
   {pinned?'Pinned at ('+x+', '+y+').':'Not pinned.'}
   {' '}Choose a position for this concept on the map.
  </p>
  <form onSubmit={submit} className="mt-3 grid gap-3">
   <label className="text-label">X coordinate
    <input type="number" step="any" required aria-label="Map X coordinate"
     value={coordinateX} onChange={e=>setCoordinateX(e.target.value)}
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3"/>
   </label>
   <label className="text-label">Y coordinate
    <input type="number" step="any" required aria-label="Map Y coordinate"
     value={coordinateY} onChange={e=>setCoordinateY(e.target.value)}
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3"/>
   </label>
   {error&&<p role="alert" className="text-label">{error}</p>}
   <div className="flex flex-wrap justify-end gap-2">
    <button type="button" disabled={busy} onClick={onClose}
     className="min-h-11 rounded-ctl border border-edge px-3 text-label">Cancel</button>
    {pinned&&<button type="button" disabled={busy} onClick={()=>{void save(null,null)}}
     className="min-h-11 rounded-ctl border border-edge px-3 text-label">Unpin</button>}
    <button type="submit" disabled={busy}
     className="min-h-11 rounded-ctl bg-amber px-3 text-label font-semibold text-amber-ink">
     {busy?'Saving…':'Save pin'}</button>
   </div>
  </form>
 </dialog>;
}
