import {LemmaError} from '../api'
import type {CommandReceipt, ExamCommand} from './contract'

export type Envelope = ExamCommand & {operationId:string; schemaVersion:1}
type DbError = {code?:string; message?:string}
export type ExamRpc = (name:string, envelope:Envelope)=>PromiseLike<{data:unknown;error:DbError|null}>
const rpcNames:Record<string,string> = {
 exam_sittings:'exam_sitting_command',exam_attempts:'exam_attempt_command',
 card_ideas:'card_idea_command',deadlines:'deadlines_command',
}
type Command = Omit<ExamCommand,'resource'> & {resource:ExamCommand['resource']|'deadlines'}

export function requireOnline(){
 if(typeof navigator!=='undefined' && navigator.onLine===false)
  throw new LemmaError('server','Reconnect to change exam prep.')
}

export function createCommandRunner(rpc:ExamRpc, newId=()=>crypto.randomUUID()){
 const pending=new Map<string,Envelope>()
 return async function run(command:Command, fixedId?:string):Promise<CommandReceipt>{
  requireOnline()
  const identity=JSON.stringify(command)
  let envelope=pending.get(identity)
  if(!envelope){
   envelope={...structuredClone(command),resource:command.resource as ExamCommand['resource'],schemaVersion:1,operationId:fixedId??newId()}
   pending.set(identity,envelope)
  }
  for(let attempt=0;attempt<2;attempt++){
   let response:Awaited<ReturnType<ExamRpc>>
   try{response=await rpc(rpcNames[command.resource],envelope)}catch{continue}
   if(response.error?.code){
    pending.delete(identity)
    const code=response.error.code
    throw new LemmaError(code==='22023'?'invalid':code==='42501'?'auth':code==='23505'?'conflict':'server',response.error.message??'Exam command failed.')
   }
   const receipt=response.data as CommandReceipt|null
   if(!response.error && receipt?.operationId===envelope.operationId &&
    (receipt.status==='ok'||receipt.status==='conflict'||receipt.status==='duplicate')){
    pending.delete(identity)
    return receipt
   }
  }
  throw new LemmaError('server','Exam request outcome is unknown. Retry the same action.')
 }
}
