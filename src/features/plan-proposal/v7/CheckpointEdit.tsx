import {useId,useState} from 'react';
import type {CheckpointView,PlanChangeOp} from '../../../data/types';
import {Button} from '../../../ui/v7/components';

export function CheckpointEdit({text,onChange,checkpoints}:{text:string;onChange:(value:string)=>void;checkpoints:readonly CheckpointView[]}){
 const id=useId(),[kind,setKind]=useState<'rename'|'add'>(checkpoints.length?'rename':'add');
 const [code,setCode]=useState(checkpoints[0]?.code??''),[title,setTitle]=useState(''),[objective,setObjective]=useState('');
 const [criterion,setCriterion]=useState(''),[step,setStep]=useState(''),[problem,setProblem]=useState('');
 const selected=checkpoints.find(row=>row.code===code);
 const ready=!!title.trim()&&(kind==='rename'?!!selected:!!objective.trim()&&!!criterion.trim()&&!!step.trim());
 function append(){
  if(!ready)return;
  try{
   const payload=JSON.parse(text) as {ops?:unknown[]};
   if(!payload||typeof payload!=='object'||!Array.isArray(payload.ops))throw Error();
   const operation:PlanChangeOp=kind==='rename'?{op:'update',code,title:title.trim()}:
    {op:'add',...(selected?{after:selected.code}:{}),title:title.trim(),objective:objective.trim(),criterion:criterion.trim(),steps:[step.trim()]};
   onChange(JSON.stringify({...payload,ops:[...payload.ops,operation]},null,2));
   setTitle('');setObjective('');setCriterion('');setStep('');setProblem('');
  }catch{setProblem('Open Advanced and check the operations array before adding this change.');}
 }
 return <div className="v7-form-stack">
  <label className="v7-field-group">Change<select className="v7-field" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>
   {checkpoints.length>0&&<option value="rename">Rename checkpoint</option>}<option value="add">Add checkpoint</option>
  </select></label>
  <label className="v7-field-group">{kind==='rename'?'Checkpoint':'Insert after'}<select className="v7-field" value={code} onChange={e=>setCode(e.target.value)}>
   {kind==='add'&&<option value="">At the beginning</option>}
   {checkpoints.map(cp=><option key={cp.id} value={cp.code}>{cp.code} · {cp.title}</option>)}
  </select></label>
  <label className="v7-field-group">New title<input className="v7-field" value={title} maxLength={80} onChange={e=>setTitle(e.target.value)}/></label>
  {kind==='add'&&<>
   <label className="v7-field-group">Objective<input className="v7-field" value={objective} maxLength={400} onChange={e=>setObjective(e.target.value)}/></label>
   <label className="v7-field-group">Demonstration criterion<input className="v7-field" value={criterion} maxLength={400} onChange={e=>setCriterion(e.target.value)}/></label>
   <label className="v7-field-group">First step<input className="v7-field" value={step} maxLength={80} onChange={e=>setStep(e.target.value)}/></label>
  </>}
  {title.trim()&&<p aria-live="polite">{kind==='rename'?(selected?.title??'Checkpoint')+' → '+title.trim():'Insert '+title.trim()+(selected?' after '+selected.title:' at the beginning')}</p>}
  <Button disabled={!ready} onClick={append}>Add change to draft</Button>
  {problem&&<p role="alert">{problem}</p>}
  <details><summary>Advanced (JSON)</summary>
   <label className="v7-field-group" htmlFor={id}>Full draft payload</label>
   <textarea id={id} className="v7-field" rows={7} value={text} onChange={e=>onChange(e.target.value)}/>
   <p>Example rename</p><pre>{JSON.stringify({ops:[{op:'update',code:'CP1',title:'Foundations'}]},null,2)}</pre>
  </details>
 </div>;
}
