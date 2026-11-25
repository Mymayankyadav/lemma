import type {ExamAttempt,SittingRecord} from './contract'
import type {TutorAnswerMeta} from '../tutor/turn-model'

/** Demo-only tutor import. A grade is explicit in the imported reply and never inferred from an answer or timer. */
export function importedExamAttempt(sitting:SittingRecord,turnId:string,question:string,reply:string,answerMeta?:TutorAnswerMeta){
 const recap=/^Review row ([a-z0-9_-]+): read a recap/.exec(question)?.[1]
 const score=/^Score: ([a-z0-9_-]+) · (correct|partial|incorrect) · (\d{1,4})\/(\d{1,4}) · (independent|hinted)$/m.exec(reply)
 const row=recap??score?.[1]
 if(!row||!sitting.blueprint.some(item=>item.key===row))return undefined
 const marks=score?Number(score[3]):0,total=score?Number(score[4]):0
 if(!recap&&(!score||!total||total>1000||marks>total))return undefined
 const patch:Pick<ExamAttempt,'row_key'|'outcome'|'independence'|'marks_awarded'|'marks_possible'|'hint_level'|'novelty'|'timed'|'seconds'>&{
  sitting_id:string;delivery:'chat';delivery_ref:string
 }={
  sitting_id:sitting.id,delivery:'chat',delivery_ref:'turn:'+turnId,row_key:row,
  outcome:recap?'exposure':score![2],independence:recap?'reading':score![5],
  hint_level:!recap&&score?.[5]==='hinted'?1:0,novelty:recap?'seen_solution':'novel',
  ...(recap?{}:{marks_awarded:marks,marks_possible:total}),
  ...(answerMeta?{timed:true,seconds:answerMeta.seconds}:{}),
 }
 return patch
}
