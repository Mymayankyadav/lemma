import {useEffect,useState} from 'react';
import {getStudyEventApi} from '../../../data/study-events';
import {DRIFT_CHANGED,clearDrift,pendingDrift} from '../../../platform/drift';
import {Button} from '../../../ui/v7/components';
import {useToast} from '../../../ui/Toast';

/** AW13: "Were you drifting?" as a card at the top of Focus, with Yes and No, until answered. */
export function DriftCard({entryId}:{entryId:string}){
 const [question,setQuestion]=useState(()=>pendingDrift(entryId)),[busy,setBusy]=useState(false),notify=useToast();
 useEffect(()=>{const read=()=>setQuestion(pendingDrift(entryId));read();window.addEventListener(DRIFT_CHANGED,read);return()=>window.removeEventListener(DRIFT_CHANGED,read);},[entryId]);
 if(!question)return null;
 async function yes(){
  if(!question||busy)return;
  setBusy(true);
  try{await getStudyEventApi().recordEvent({entryId:question.entryId,kind:'drift',durationMinutes:question.minutes});clearDrift();notify('Noted',{tone:'success'});}
  catch{notify('We couldn’t note that. Try again.',{tone:'danger'});}
  finally{setBusy(false);}
 }
 return <section className="v7-card v7-focus-away" aria-label="Were you drifting?">
  <p><strong>You were away for {question.minutes} min.</strong> Were you drifting?</p>
  <div className="v7-focus-away-actions">
   <Button small onClick={clearDrift} disabled={busy}>No</Button>
   <Button small variant="primary" loading={busy} onClick={()=>{void yes();}}>Yes, note it</Button>
  </div>
 </section>;
}
