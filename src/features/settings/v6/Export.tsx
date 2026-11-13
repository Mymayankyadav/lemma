import {useState} from 'react';
import {Download} from 'lucide-react';
import {getApi} from '../../../data';
import {useToast} from '../../../ui/Toast';
import {isNative} from '../../../platform/native';

/** N28.2.2: the same authenticated exportAll download as legacy Settings. AW2 (v7 UX audit r3, E14): inside the
 *  Android app a download cannot be saved, so the same file goes to Android's share sheet (Files, Drive, email).
 *  V43: the logic is shared by this (v6) section and the v7 Data and account page. */
export function useBackup(){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [shared,setShared]=useState(false);
 const notify=useToast();
 const app=isNative();
 async function share(){
  if(busy)return;
  setBusy(true);setError('');setShared(false);
  try{
   const blob=await getApi().exportAll();
   const files=await import('../../../platform/files');
   await files.shareFile(blob,files.backupFileName());
   setShared(true);
   notify('Choose where to keep your backup',{tone:'success'});
  }catch{
   setError("Couldn't prepare the backup. Try again.");
   notify("Couldn't prepare the backup.",{tone:'danger'});
  }finally{setBusy(false);}
 }
 async function download(){
  if(busy)return;
  setBusy(true);setError('');
  let url:string|null=null;
  try{
   const blob=await getApi().exportAll();
   url=URL.createObjectURL(blob);
   const anchor=document.createElement('a');
   anchor.href=url;
   anchor.download='lemma-backup-'+new Date().toISOString().slice(0,10)+'.json';
   document.body.appendChild(anchor);
   try{anchor.click()}finally{anchor.remove()}
   notify('Backup downloaded',{tone:'success'});
  }catch{
   setError("Couldn't download the backup. Try again.");
   notify("Couldn't download the backup.",{tone:'danger'});
  }finally{
   if(url!==null){
    const objectUrl=url;
    setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
   }
   setBusy(false);
  }
 }
 return {app,busy,error,shared,run:()=>app?share():download(),label:app?'Save a backup':'Download a backup'};
}
export default function ExportSettings(){
 const {app,busy,error,shared,run}=useBackup();
 return <section aria-labelledby="v6-export-title" className="flex flex-col gap-4 pb-8">
  <h2 id="v6-export-title" className="text-title-s font-semibold text-ink">Export</h2>
  <p className="text-body text-ink-2">Save a JSON backup of your existing study record.</p>
  <div className="rounded-slab border border-edge bg-[var(--paper)] p-4">
   <h3 className="text-body font-semibold text-ink">{app?'Save a backup':'Download a backup'}</h3>
   <p className="my-3 text-label text-ink-2">{app
    ?'Android asks where to keep it: Files keeps it on this phone; Drive or email keeps a copy elsewhere. Keep it somewhere only you can access.'
    :'Keep the downloaded file somewhere only you can access. No data is shared from this screen.'}</p>
   <button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-ctl border border-edge px-4 py-2 text-body font-semibold text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-amber"
    disabled={busy} aria-busy={busy||undefined} onClick={()=>{void run()}}>
    <Download size={18} aria-hidden="true"/>{busy?'Preparing backup…':app?'Save a backup':'Download a backup'}
   </button>
   {shared&&<p role="status" className="mt-3 text-label text-ink-2">Your backup is in Android's share sheet. Choose Files to keep it on this phone.</p>}
   {error&&<p role="alert" className="mt-3 text-label text-[var(--danger)]">{error}</p>}
  </div>
 </section>;
}
