import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router';
import {useSettings,useUpdateSettings} from '../../../data/hooks';
import {useNewPath} from '../../new-project/useNewPath';
import {Button,Field,Stepper} from '../../../ui/v7/components';
import {useToast} from '../../../ui/Toast';
import {getMode} from '../../../data/mode';
import '../../../ui/v7/room.css';

const steps=['What are you studying?','Your rhythm','Connect your tutor'] as const;
/** U3 V29: study first, a sustainable rhythm second, and the tutor connection last. Every step can be skipped. */
export default function RoomWelcome(){
 const navigate=useNavigate(),settings=useSettings(),update=useUpdateSettings(),path=useNewPath(),notify=useToast();
 const [step,setStep]=useState(0),[minutes,setMinutes]=useState(settings.data?.planning?.daily_minimum_minutes??30),[start,setStart]=useState(settings.data?.planning?.window_start??'08:00'),[busy,setBusy]=useState(false);
 const data=settings.data,connected=!!data?.connectorLastSeenAt;
 useEffect(()=>{
  if(step!==2||connected)return;
  const timer=window.setInterval(()=>{if(document.visibilityState!=='hidden')void settings.refetch();},3000);
  return()=>window.clearInterval(timer);
 },[step,connected,settings.refetch]);
 async function finish(){
  if(busy)return;setBusy(true);
  try{if(getMode()!=='demo')await update.mutateAsync({ui:{...(data?.ui??{}),welcomed:true}});navigate('/',{replace:true});}
  catch{notify('Could not save. Try again.',{tone:'danger'});}
  finally{setBusy(false);}
 }
 async function create(){
  const result=await path.submit();
  if(result.kind==='created'||result.kind==='partial'){notify('Path created',{tone:'success'});setStep(1);}
  else if(result.kind==='failed')notify(result.message,{tone:'danger'});
 }
 async function saveRhythm(){
  if(busy)return;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)){notify('Choose a day start in 24-hour time.',{tone:'danger'});return;}
  setBusy(true);
  try{
   await update.mutateAsync({planning:{window_end:'22:00',gap_minutes:10,max_consecutive_minutes:90,daily_intention:false,...data?.planning,window_start:start,daily_minimum_minutes:minutes}});
   setStep(2);
  }catch{notify('Could not save your rhythm. Try again or skip this step.',{tone:'danger'});}
  finally{setBusy(false);}
 }
 return <main id="main-content" className="v7-welcome" aria-label="Welcome">
  <header className="v7-welcome-head"><p className="v7-eyebrow">Step {step+1} of 3</p>
   <ol className="v7-welcome-dots" aria-label="Setup progress">{steps.map((label,index)=><li key={label} data-done={index<=step||undefined} aria-label={label} aria-current={index===step?'step':undefined}/>)}</ol>
   <h1 className="v7-learn-title">{steps[step]}</h1>
  </header>
  {step===0&&<section className="v7-welcome-body" aria-label={steps[0]}>
   <p>Name the subject or question you want to work on. Your tutor can shape the path with you later.</p>
   <Field label="What are you studying?" placeholder="e.g. Abstract Algebra" value={path.name} onChange={event=>path.setName(event.target.value)} disabled={path.saving}/>
   <Button variant="primary" loading={path.saving} disabled={!path.name.trim()} onClick={()=>{void create();}}>Create path</Button>
   <a className="v7-button v7-ghost" href="?demo=1&flags=v7Shell,v6Shell,v7Room#/"><span>Explore the example</span></a>
  </section>}
  {step===1&&<section className="v7-welcome-body" aria-label={steps[1]}>
   <p>Start with a daily minimum you can keep. You can change it in Settings.</p>
   <Stepper label="Minutes a day" unit="min" value={minutes/5} format={value=>value*5+' min'} min={0} max={144} onChange={value=>setMinutes(value*5)}/>
   <Field label="Day starts at" type="time" value={start} onChange={event=>setStart(event.target.value)}/>
   <Button variant="primary" loading={busy} disabled={!data} onClick={()=>{void saveRhythm();}}>Save rhythm</Button>
  </section>}
  {step===2&&<section className="v7-welcome-body" aria-label={steps[2]}>
   <p>Your tutor proposes changes. You approve them in Lemma.</p>
   <ol className="v7-welcome-list"><li>Open your tutor and add a custom connector in its settings.</li><li>Copy the address below, paste it into the connector field and save.</li><li>Ask your tutor to read your Lemma study record. This page will confirm the connection.</li></ol>
   <Field label="Connector address" value={data?.connectorUrl??''} readOnly onFocus={event=>event.target.select()}/>
   <Button disabled={!data?.connectorUrl} onClick={()=>{void navigator.clipboard?.writeText(data!.connectorUrl).then(()=>notify('Address copied',{tone:'success'})).catch(()=>notify('Select and copy the address in the field.',{tone:'danger'}));}}>Copy address</Button>
   <div className="v7-welcome-foot"><a className="v7-button v7-secondary" href="https://claude.ai/" target="_blank" rel="noopener noreferrer"><span>Open Claude</span></a><a className="v7-button v7-secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"><span>Open ChatGPT</span></a></div>
   <p className="v7-meta" role="status">{connected?'Connected — your tutor has reached Lemma.':'Waiting for your tutor’s first tool call…'}</p>
   <Button variant="primary" loading={busy} disabled={!connected} onClick={()=>{void finish();}}>Open my notebook</Button>
  </section>}
  <footer className="v7-welcome-foot">{step>0&&<Button variant="ghost" disabled={busy||path.saving} onClick={()=>setStep(value=>value-1)}>Back</Button>}
   <Button variant="ghost" disabled={busy||path.saving} onClick={()=>step<2?setStep(value=>value+1):void finish()}>{step<2?'Skip this step':'Skip and finish'}</Button>
  </footer>
 </main>;
}
