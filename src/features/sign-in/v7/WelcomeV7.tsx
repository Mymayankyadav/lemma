import {useState} from 'react';
import {useNavigate} from 'react-router';
import {Copy} from 'lucide-react';
import {useSettings,useUpdateSettings} from '../../../data/hooks';
import {getMode} from '../../../data/mode';
import {Button,Field,Stepper,Switch} from '../../../ui/v7/components';
import {ConnectorAddress} from '../../settings/ConnectorAddress';
import {useNewPath} from '../../new-project/useNewPath';
import {useToast} from '../../../ui/Toast';
import {formatDuration} from '../../../lib/format';
import './welcome.css';
import {isFlagOn} from '../../../flags';
import RoomWelcome from './RoomWelcome';

const steps=['Connect your tutor','Start your first path','Your day'] as const;

/** PLAN §6.15 First run: three steps, each skippable, never blocking; it ends on Today. */
export default function WelcomeV7(){
 return isFlagOn('v7Room')?<RoomWelcome/>:<LegacyWelcome/>;
}
function LegacyWelcome(){
 const navigate=useNavigate(),settings=useSettings(),update=useUpdateSettings(),notify=useToast(),path=useNewPath();
 const [step,setStep]=useState(0),[hours,setHours]=useState(2),[dayEnd,setDayEnd]=useState('17:00'),[remind,setRemind]=useState(true),[busy,setBusy]=useState(false);
 const data=settings.data;
 async function finish(extra:Record<string,unknown>={}){
  setBusy(true);
  try{if(data&&getMode()!=='demo')await update.mutateAsync({ui:{...(data.ui??{}),welcomed:true},...extra});}
  catch{notify('Could not save; you can change this in Settings.',{tone:'danger'});}
  finally{setBusy(false);navigate('/',{replace:true});}
 }
 const next=()=>step<2?setStep(step+1):void finish();
 async function createPath(){
  const result=await path.submit();
  if(result.kind==='created'||result.kind==='partial'){notify('Path created',{tone:'success'});setStep(2);}
  else if(result.kind==='failed')notify('Could not create the path.',{tone:'danger'});
 }
 async function saveDay(){
  const planning=data?.planning?{...data.planning,daily_minimum_minutes:hours*60,window_end:dayEnd}:undefined;
  await finish({...(planning?{planning}:{}),notify:{...(data?.notify??{}),enabled:remind}});
 }
 return <main id="main-content" className="v7-welcome" aria-label="Welcome">
  <header className="v7-welcome-head">
   <p className="v7-eyebrow">{'Step '+(step+1)+' of 3'}</p>
   <ol className="v7-welcome-dots" aria-hidden="true">{steps.map((_,index)=><li key={index} data-done={index<=step||undefined}/>)}</ol>
   <h1 className="v7-learn-title">{steps[step]}</h1>
  </header>
  {step===0&&<section className="v7-welcome-body" aria-label={steps[0]}>
   <p>Lemma works with your AI tutor. Add this address as a connector in Claude or ChatGPT, then ask your tutor to read your study record.</p>
   {data?<ConnectorAddress value={data.connectorUrl}/>:<p className="v7-meta">The address appears once your settings load.</p>}
   <Button disabled={!data} onClick={()=>{void navigator.clipboard?.writeText(data?.connectorUrl??'').then(()=>notify('Copied',{tone:'success'})).catch(()=>notify('Could not copy',{tone:'danger'}));}}><Copy aria-hidden="true"/>Copy address</Button>
   <ol className="v7-welcome-list"><li>Open your tutor's settings and add a custom connector.</li><li>Paste the address and save.</li><li>Start a chat and say "Let's plan a new path".</li></ol>
  </section>}
  {step===1&&<section className="v7-welcome-body" aria-label={steps[1]}>
   <Field label="Name" placeholder="e.g. Abstract Algebra" value={path.name} onChange={event=>path.setName(event.target.value)} disabled={path.saving}/>
   <p className="v7-meta">Your tutor fills in the subject, goal and plan. You can add sources from the path later.</p>
   <Button variant="primary" loading={path.saving} disabled={!path.name.trim()} onClick={()=>{void createPath();}}>Create path</Button>
   <a className="v7-button v7-ghost" href="?demo=1#/"><span>Use the example</span></a>
  </section>}
  {step===2&&<section className="v7-welcome-body" aria-label={steps[2]}>
   <Stepper label="Daily minimum" unit="h" format={n=>n===0?'None':formatDuration(n*60)} value={hours} min={0} max={12} onChange={setHours}/>
   <Field label="Day ends at" inputMode="numeric" maxLength={5} value={dayEnd} onChange={event=>setDayEnd(event.target.value)} hint="24-hour time, for example 17:00"/>
   <Switch label="Reminders" checked={remind} onChange={setRemind}/>
   <Button variant="primary" loading={busy} onClick={()=>{void saveDay();}}>Finish</Button>
  </section>}
  <div className="v7-welcome-foot"><Button variant="ghost" disabled={busy} onClick={next}>{step<2?'Skip this step':'Skip and finish'}</Button>
   {step<2&&step===0&&<Button onClick={next}>Next</Button>}</div>
 </main>;
}
