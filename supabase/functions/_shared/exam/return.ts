import {planExam,type ExamSnapshot,type EvidenceStatus} from './plan.ts'

const rank:Record<EvidenceStatus,number>={unseen:0,gap:0,stale:1,conflicting:1,shaky:2,secure:3}

export function improvedExamRows(snapshot:ExamSnapshot,activatedAt:string|undefined|null){
 if(!activatedAt||Date.parse(activatedAt)>=Date.parse(snapshot.now))return []
 const before=new Map(planExam({...snapshot,now:activatedAt}).rows.map(row=>[row.row.key,row.status]))
 return planExam(snapshot).rows.filter(item=>rank[item.status]>rank[before.get(item.row.key)??'unseen'])
  .sort((a,b)=>rank[b.status]-rank[a.status]||b.expected-a.expected)
}

export function recentExamReturn(sitting:{status:string;paused_at?:string|null;finished_at?:string|null},now:number){
 const timestamp=sitting.status==='finished'?sitting.finished_at:sitting.status==='paused'?sitting.paused_at:null
 if(!timestamp)return false
 const age=now-Date.parse(timestamp)
 return age>=0&&age<=(sitting.status==='finished'?14:3)*86400000
}
