import {useEffect,useRef,useState} from 'react';
import {openPracticeQuestion,savePracticeResult} from '../../data/adaptive/agenda-api';
import {authGeneration,onAccountChange} from '../../data/authBoundary';
import {PracticeScoreRejectedError,type PracticeDelivery,type PracticeOutcome,type PracticeScoreRequest} from '../../../supabase/functions/_shared/practice/delivery';
import {Button} from '../../ui/v7/components';

/** A delivered question only becomes evidence after the learner explicitly saves their assessment. */
export function PracticeQuestion({canOpen=true,sessions=[],onSaved}:{canOpen?:boolean;
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
        <label>Result<select aria-label="Practice result" value={result} onChange={e=>setResult(e.target.value as typeof result)}>
          <option value="">Choose a result</option><option value="ok">I solved it</option><option value="fail">Not yet</option></select></label>
        <label>Hints used<select aria-label="Practice hints used" value={hint} onChange={e=>setHint(e.target.value)}>
          <option value="">Choose help used</option><option value="0">No hints</option><option value="1">A nudge</option>
          <option value="2">A key idea</option><option value="3">One worked step</option><option value="4">A worked solution</option></select></label>
        <label>Question familiarity<select aria-label="Practice question familiarity" value={novelty} onChange={e=>setNovelty(e.target.value as typeof novelty)}>
          <option value="">Choose familiarity</option><option value="novel">New to me</option><option value="familiar">I have tried it before</option>
          <option value="seen_solution">I have seen its solution</option></select></label>
        <label>Study session<select aria-label="Practice study session" value={session} onChange={e=>setSession(e.target.value)}>
          <option value="">Practice outside a session</option>{deliveredSessions.map(s=><option key={s.id} value={s.id}>Session {s.number}</option>)}</select></label>
      </fieldset>
      <Button small type="submit" disabled={busy}>{busy?'Saving…':pending?'Retry save':'Save my result'}</Button>
    </form>}
  </>:canOpen?<Button small disabled={busy} onClick={()=>void open()}>{busy?'Opening…':'Open practice question'}</Button>:null}
  {error&&<p role="alert">{error}</p>}</div>;
}
