import type {DemoStore} from './model';

type Rows=Pick<DemoStore,'notes'|'reviews'|'projects'|'subjects'>;
type TabStorage=Pick<Storage,'getItem'|'setItem'>;
const key='lemma.demo.authored-cards.v1';
const mergeById=<T extends {id:string|number}>(seed:T[],saved:T[])=>{
 const rows=new Map(seed.map(row=>[row.id,row]));
 for(const row of saved)rows.set(row.id,row);
 return [...rows.values()];
};

/** The durable demo run stores card IDs, not a second copy of their answers.
 * Keep the actual authored notes, their paths and their grade receipts in this tab.
 * Never serialize a whole fixture, unrelated seeded cards or authenticated data. */
export class AuthoredCards {
 private readonly tracked=new Set<number>();
 constructor(private readonly tab:TabStorage,store:DemoStore){
  try{
   const raw=tab.getItem(key);if(!raw)return;
   const saved=JSON.parse(raw) as Rows&{seed:number};
   if(saved.seed!==store.seed||!Array.isArray(saved.notes)||!Array.isArray(saved.reviews)||
    !Array.isArray(saved.projects)||!Array.isArray(saved.subjects))return;
   const numbers=new Set(store.notes.map(n=>n.note.noteNo));
   const projects=mergeById(store.projects,saved.projects),subjects=mergeById(store.subjects,saved.subjects);
   const reviews=mergeById(store.reviews,saved.reviews);
   for(const n of saved.notes){
    if(!Number.isSafeInteger(n.note.noteNo)||numbers.has(n.note.noteNo)||typeof n.note.front!=='string'||
     typeof n.note.back!=='string'||!Array.isArray(n.cards)||!Array.isArray(n.comments)||
     !projects.some(p=>p.id===n.projectId))return;
    numbers.add(n.note.noteNo);
   }
   store.projects=projects;store.subjects=subjects;store.reviews=reviews;
   store.notes.push(...saved.notes);
   for(const n of saved.notes)this.tracked.add(n.note.noteNo);
  }catch{/* Fresh fixture when tab storage is unavailable or invalid. */}
 }
 // An untracked seed card can also be graded before a reload. Never reuse its
 // receipt number for an authored card: an older run's Undo must not target it.
 nextReviewId(seed:number,minimum:number){
  const counter=key+'.grade.'+seed;
  try{
   const last=Number(this.tab.getItem(counter)),id=Math.max(minimum,Number.isSafeInteger(last)?last+1:0);
   this.tab.setItem(counter,String(id));return id;
  }catch{return minimum;}
 }
 add(noteNo:number){this.tracked.add(noteNo);}
 save(store:DemoStore){
  if(!this.tracked.size)return;
  const notes=store.notes.filter(n=>this.tracked.has(n.note.noteNo));
  const cardIds=new Set(notes.flatMap(n=>n.cards.map(c=>c.id))),paths=new Set(notes.map(n=>n.projectId));
  const projects=store.projects.filter(p=>paths.has(p.id)),subjectIds=new Set(projects.map(p=>p.subjectId));
  const rows:Rows={notes,projects,subjects:store.subjects.filter(s=>subjectIds.has(s.id)),
   reviews:store.reviews.filter(r=>cardIds.has(r.cardId))};
  try{this.tab.setItem(key,JSON.stringify({...rows,seed:store.seed}));}
  catch{/* The in-memory adapter remains usable while tab storage is unavailable. */}
 }
}
