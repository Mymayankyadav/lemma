import {useEffect,useRef,useState} from 'react';
import {openPracticeQuestion,savePracticeResult} from '../../data/adaptive/agenda-api';
import {authGeneration,onAccountChange} from '../../data/authBoundary';
import {PracticeScoreRejectedError,type PracticeDelivery,type PracticeOutcome,type PracticeScoreRequest} from '../../../supabase/functions/_shared/practice/delivery';
import {Button,Picker} from '../../ui/v7/components';

/** A delivered question only becomes evidence after the learner explicitly saves their assessment. */
export function PracticeQuestion({canOpen=true,sessions=[],onSaved,kit=false}:{canOpen?:boolean;kit?:boolean;
  sessions?:{id:string;number:number;project_id:string;state:string}[];onSaved?:()=>void}){
  const [request,setRequest]=useState(()=>crypto.randomUUID());
  const [delivery,setDelivery]=useState<Extract<PracticeDelivery,{status:'available'}>|null>(null);
  const [deliveredSessions,setDeliveredSessions]=useState<typeof sessions>([]);
  const [result,setResult]=useState<PracticeOutcome['result']|''>(''),[novelty,setNovelty]=useState<PracticeOutcome['novelty']|''>('');
  const [hint,setHint]=useState(''),[session,setSession]=useState('');
  const [pending,setPending]=useState<PracticeScoreRequest|null>(null),[saved,setSaved]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const mounted=useRef(true),flight=useRef(false);
  useEffect(()=>{
    mounted.current=true;
    const unsubscribe=onAccountChange(()=>{
      setDelivery(null);setDeliveredSessions([]);setPending(null);setSaved(false);setResult('');setNovelty('');setHint('');setSession('');
      setRequest(crypto.randomUUID());setBusy(false);setError('');flight.current=false;
    });
    return()=>{mounted.current=false;unsubscribe();};
  },[]);
  async function open(requestId=request){
    if(flight.current||!canOpen)return;
    const generation=authGeneration();flight.current=true;setBusy(true);setError('');
    try{
      const receipt=await openPracticeQuestion(requestId);
      if(!mounted.current||generation!==authGeneration())return;
      if(receipt.status==='available'){setDelivery(receipt);setDeliveredSessions(sessions.filter(s=>s.project_id===receipt.projectId&&s.state==='open'));}
      else {setError('This question is no longer available.');setRequest(crypto.randomUUID());}
    }catch{if(mounted.current&&generation===authGeneration())setError('Could not open the question. Try again.');}
    finally{if(mounted.current&&generation===authGeneration()){setBusy(false);flight.current=false;}}
  }
  function next(){
    if(!saved||flight.current||!canOpen)return;
    const requestId=crypto.randomUUID();
    setRequest(requestId);setDelivery(null);setDeliveredSessions([]);setPending(null);setSaved(false);
    setResult('');setNovelty('');setHint('');setSession('');setError('');
    void open(requestId);
  }
  async function save(){
    if(flight.current||!delivery||saved)return;
    if(!pending&&(!result||!novelty||hint==='')){setError('Choose your result, hints used and question familiarity.');return;}
    const command=pending??{operationId:crypto.randomUUID(),requestId:delivery.requestId,learnerConfirmed:true as const,
      outcome:{result:result as PracticeOutcome['result'],hintLevel:Number(hint),novelty:novelty as PracticeOutcome['novelty'],...(session?{sessionId:session}:{})}};
    const generation=authGeneration();setPending(command);flight.current=true;setBusy(true);setError('');
    try{
      await savePracticeResult(command);
      if(!mounted.current||generation!==authGeneration())return;
      setSaved(true);onSaved?.();
    }catch(error){
      if(mounted.current&&generation===authGeneration()){
        if(error instanceof PracticeScoreRejectedError&&command.outcome.sessionId&&
          error.rejection.operationId===command.operationId&&error.rejection.requestId===command.requestId){
          setPending(null);setSession('');
          setDeliveredSessions(sessions.filter(s=>s.project_id===delivery.projectId&&s.state==='open'&&s.id!==command.outcome.sessionId));
          setError(error.message);
        }else setError('Could not confirm the saved result. Retry to confirm this same assessment.');
      }
    }
    finally{if(mounted.current&&generation===authGeneration()){setBusy(false);flight.current=false;}}
  }
  return <div>{delivery?<>
    <p aria-label="Practice question">{delivery.question}</p>
    {saved?<><p role="status">Your practice result is saved.</p>
      <Button small disabled={busy||!canOpen} onClick={next}>Next question</Button>
    </>:<form aria-label="Practice result" onSubmit={e=>{e.preventDefault();void save();}}>
      <fieldset disabled={busy||!!pending}><legend>Your assessment</legend>
        <PracticeChoice kit={kit} disabled={busy||!!pending} label="Practice result" value={result} onChange={value=>setResult(value as typeof result)}
          options={[["","Choose a result"],["ok","I solved it"],["fail","Not yet"]]}/>
        <PracticeChoice kit={kit} disabled={busy||!!pending} label="Practice hints used" value={hint} onChange={setHint}
          options={[["","Choose help used"],["0","No hints"],["1","A nudge"],["2","A key idea"],["3","One worked step"],["4","A worked solution"]]}/>
        <PracticeChoice kit={kit} disabled={busy||!!pending} label="Practice question familiarity" value={novelty} onChange={value=>setNovelty(value as typeof novelty)}
          options={[["","Choose familiarity"],["novel","New to me"],["familiar","I have tried it before"],["seen_solution","I have seen its solution"]]}/>
        <PracticeChoice kit={kit} disabled={busy||!!pending} label="Practice study session" value={session} onChange={setSession}
          options={[["","Practice outside a session"],...deliveredSessions.map(item=>[item.id,"Session "+item.number] as [string,string])]}/>

      </fieldset>
      <Button small type="submit" disabled={busy}>{busy?'Saving…':pending?'Retry save':'Save my result'}</Button>
    </form>}
  </>:canOpen?<Button small disabled={busy} onClick={()=>void open()}>{busy?'Opening…':'Open practice question'}</Button>:null}
  {error&&<p role="alert">{error}</p>}</div>;
}

function PracticeChoice({kit,label,value,onChange,options,disabled}:{kit:boolean;label:string;value:string;onChange:(value:string)=>void;options:[string,string][];disabled:boolean}) {
 if(kit)return <Picker label={label} value={options.find(([id])=>id===value)?.[1]??options[0][1]} disabled={disabled}
   options={options.map(([,name])=>name)} onChange={name=>onChange(options.find(([,label])=>label===name)![0])}/>;
 return <label>{label}<select aria-label={label} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>
   {options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>;
}
