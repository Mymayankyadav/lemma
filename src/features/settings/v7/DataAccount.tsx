import {useState} from 'react';
import {Link} from 'react-router';
import {Download,LogOut,Trash2} from 'lucide-react';
import {Button,Checkbox,Field,Sheet} from '../../../ui/v7/components';
import {useBackup} from '../v6/Export';
import {DELETE_CONFIRMATION,useAccountDeletion} from '../v6/DeleteAccount';
import {Group} from './SettingsLists';
import {isFlagOn} from '../../../flags';

/**
 * V43 (v7 UX audit r3): Settings › Data and account was the old form inside a v7 page (12 px text in seven places, a
 * serif v7 does not load, a 13 px native checkbox, an underlined link and "Download a backup" three times). It is now
 * three grouped lists in the kit's sizes: Account (sign out), Export (one row, one sentence, one button) and Delete
 * account, whose confirmation moves into a sheet with the kit's checkbox and field.
 */
export function DataAccount({demo,onSignOut,signingOut}:{demo:boolean;onSignOut:()=>void;signingOut:boolean}){
 const backup=useBackup();
 const deletion=useAccountDeletion();
 const [confirming,setConfirming]=useState(false);
 const padAvailable=isFlagOn('padLocal');
 const devicePads=!demo&&padAvailable;
 return <div className="v7-settings-body v7-data">
  <Group title="Account" note={demo?'You are exploring the example workspace. Sign in with Google to open your own record.':undefined}>
   <li className="v7-data-row"><span className="v7-set-text"><span className="v7-set-label">{demo?'Example workspace':'Your study record'}</span></span>
    <Button small loading={signingOut} onClick={onSignOut}><LogOut aria-hidden="true"/>Sign out</Button></li>
  </Group>
  {padAvailable&&<Group title="Device notes">
   <li className="v7-data-row"><span className="v7-set-text"><span className="v7-set-label">Saved Pad notes</span>
    <small>Open or export notes and drawings saved on this device.</small></span>
    <Link className="v7-button v7-secondary v7-small" to="/pad">Open saved notes</Link></li>
  </Group>}
  <Group title="Export">
   <li className="v7-data-row"><span className="v7-set-text"><span className="v7-set-label">Backup</span>
    <small>{backup.app?'A JSON copy of your whole record. Android asks where to keep it: Files keeps it on this phone; Drive or email keeps a copy elsewhere.'
     :'A JSON copy of your whole record. Keep it somewhere only you can open.'}{devicePads&&' Includes saved Local Pad revisions on this device.'}</small></span>
    <Button small loading={backup.busy} onClick={()=>{void backup.run();}}><Download aria-hidden="true"/>{backup.busy?'Preparing backup…':backup.label}</Button></li>
   {backup.shared&&<li className="v7-data-status" role="status">Your backup is in Android's share sheet. Choose Files to keep it on this phone.</li>}
   {backup.error&&<li className="v7-data-status" role="alert">{backup.error}</li>}
  </Group>
  <Group title="Delete account">
   <li className="v7-data-row"><span className="v7-set-text"><span className="v7-set-label">Delete account</span>
    <small>Removes your study record, files, tutor connection and sign-in for good.</small></span>
    <Button small destructive onClick={()=>setConfirming(true)}><Trash2 aria-hidden="true"/>Delete…</Button></li>
  </Group>
  <Sheet open={confirming} onClose={()=>setConfirming(false)} eyebrow="Data and account" title="Delete your account?"
   footer={<><Button variant="ghost" onClick={()=>setConfirming(false)}>Keep account</Button>
    <Button variant="primary" destructive loading={deletion.busy} disabled={!deletion.allowed} onClick={()=>{void deletion.requestDeletion();}}>Delete account permanently</Button></>}>
   <div className="v7-data-sheet">
    <p>This permanently deletes your study record, uploaded files, tutor connection and sign-in. It cannot be undone.{devicePads&&' Saved Local Pads on this device are also removed. Clear Pad data on your other devices separately.'}</p>
    <Button onClick={()=>{void backup.run();}} loading={backup.busy}><Download aria-hidden="true"/>{backup.label} first</Button>
    <Checkbox label="I have a backup, or I chose not to keep one." checked={deletion.exported} disabled={deletion.busy||deletion.mode!=='live'} onChange={deletion.setExported}/>
    <Field label={'Type '+DELETE_CONFIRMATION+' to confirm'} aria-label="Type delete confirmation" autoComplete="off" value={deletion.confirmation}
     disabled={deletion.busy||deletion.mode!=='live'} onChange={event=>deletion.setConfirmation(event.target.value)}/>
    {deletion.mode!=='live'&&<p className="v7-meta" role="status">The example workspace has no account to delete.</p>}
    {deletion.error&&<p className="v7-error" role="alert">{deletion.error}</p>}
   </div>
  </Sheet>
 </div>;
}
