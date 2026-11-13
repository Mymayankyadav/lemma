// N103: deliberate live-account deletion request. Backend owns all deletion.
import {useState} from 'react';
import {useNavigate} from 'react-router';
import {getMode} from '../../../data/mode';
import {liveClient} from '../../../data/live/client';
import {useToast} from '../../../ui/Toast';
export const DELETE_CONFIRMATION='DELETE MY ACCOUNT';
export function canDeleteAccount(confirm:string,exported:boolean,busy:boolean,mode:string){
 return mode==='live'&&!busy&&exported&&confirm===DELETE_CONFIRMATION;
}
export default function DeleteAccount({onExport}:{onExport:()=>void}){
 const mode=getMode(),navigate=useNavigate(),notify=useToast();
 const [confirmation,setConfirmation]=useState('');
 const [exported,setExported]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function requestDeletion(){
  if(!canDeleteAccount(confirmation,exported,busy,mode))return;
  setBusy(true);setError('');
  try{
   const owner=liveClient();
   const response=await owner.functions.invoke('account-delete',{
    body:{confirmation:DELETE_CONFIRMATION,exportAcknowledged:true},
   });
   if(response.error||response.data?.deleted!==true)
    throw Error('Could not verify complete account deletion. Your account may still exist.');
   await owner.auth.signOut();
   notify('Account deleted',{tone:'success'});
   navigate('/sign-in',{replace:true});
  }catch(e){
   setError(e instanceof Error?e.message:'Account deletion could not be verified');
  }finally{setBusy(false)}
 }
 return <section aria-label="Delete account" className="mt-5 border-t border-edge pt-4">
  <h3 className="text-body font-semibold text-[var(--danger)]">Delete account</h3>
  <p className="mt-2 text-label text-ink-2">
   Permanently delete your study record, uploaded files, connector access and sign-in.
   This cannot be undone. Export a copy before continuing.
  </p>
  <button type="button" onClick={onExport} className="mt-2 inline-flex min-h-11 items-center text-label font-semibold underline">
   Open export settings
  </button>
  <label className="mt-2 flex min-h-11 items-center gap-2 text-label">
   <input type="checkbox" checked={exported} disabled={busy||mode!=='live'}
    onChange={e=>setExported(e.target.checked)}/>
   I have downloaded or deliberately declined an export.
  </label>
  <label className="mt-2 block text-label">
   Type <strong>{DELETE_CONFIRMATION}</strong> to confirm permanent deletion
   <input className="mt-2 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 p-3"
    aria-label="Type delete confirmation" autoComplete="off" value={confirmation}
    disabled={busy||mode!=='live'}
    onChange={e=>setConfirmation(e.target.value)}/>
  </label>
  {mode!=='live'&&<p role="status" className="text-caption">Demo data cannot delete a live account.</p>}
  {error&&<p role="alert" className="mt-2 text-label text-[var(--danger)]">{error}</p>}
  <button type="button" className="mt-3 min-h-11 rounded-ctl border border-[var(--danger)] px-4 text-label font-semibold text-[var(--danger)] disabled:opacity-50"
   disabled={!canDeleteAccount(confirmation,exported,busy,mode)}
   onClick={()=>{void requestDeletion()}}>
   {busy?'Deleting account…':'Delete account permanently'}
  </button>
 </section>;
}
