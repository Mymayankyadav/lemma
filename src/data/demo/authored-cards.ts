import type {DemoStore} from './model';
import type {FirstCardOperation} from './first-card';

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
 private readonly operations=new Map<string,FirstCardOperation>();
 constructor(private readonly tab:TabStorage,store:DemoStore,private readonly storageKey=key){
  try{
   const raw=tab.getItem(this.storageKey);if(!raw)return;
   const saved=JSON.parse(raw) as Rows&{seed:number;firstCardOperations?:Record<string,FirstCardOperation>};
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
   if(this.storageKey!==key&&saved.firstCardOperations)
    for(const [id,operation] of Object.entries(saved.firstCardOperations))
     if(operation&&typeof operation.fingerprint==='string'&&operation.receipt&&
      saved.notes.some(n=>n.note.noteId===operation.receipt.noteId&&n.note.noteNo===operation.receipt.noteNo))
      this.operations.set(id,operation);
  }catch{/* Fresh fixture when tab storage is unavailable or invalid. */}
 }
 // An untracked seed card can also be graded before a reload. Never reuse its
 // receipt number for an authored card: an older run's Undo must not target it.
 nextReviewId(seed:number,minimum:number){
  const counter=this.storageKey+'.grade.'+seed;
  try{
   const last=Number(this.tab.getItem(counter)),id=Math.max(minimum,Number.isSafeInteger(last)?last+1:0);
   this.tab.setItem(counter,String(id));return id;
  }catch{return minimum;}
 }
 add(noteNo:number){this.tracked.add(noteNo);}
 firstCard(operationId:string){return this.operations.get(operationId);}
 /** Persist the row and receipt in one tab-storage write. Roll back on failure. */
 commitFirstCard(store:DemoStore,operationId:string,operation:FirstCardOperation){
  this.writeSnapshot(store,{id:operationId,operation});
  this.tracked.add(operation.receipt.noteNo);
  this.operations.set(operationId,operation);
 }
 save(store:DemoStore){
  if(!this.tracked.size)return;
  try{this.writeSnapshot(store);}
  catch{/* The ordinary demo adapter remains usable in memory. */}
 }
 private writeSnapshot(store:DemoStore,pending?:{id:string;operation:FirstCardOperation}){
  const notes=store.notes.filter(n=>this.tracked.has(n.note.noteNo)||
   n.note.noteNo===pending?.operation.receipt.noteNo);
  const cardIds=new Set(notes.flatMap(n=>n.cards.map(c=>c.id))),paths=new Set(notes.map(n=>n.projectId));
  const projects=store.projects.filter(p=>paths.has(p.id)),subjectIds=new Set(projects.map(p=>p.subjectId));
  const rows:Rows={notes,projects,subjects:store.subjects.filter(s=>subjectIds.has(s.id)),
   reviews:store.reviews.filter(r=>cardIds.has(r.cardId))};
  const operations=pending?new Map([...this.operations,[pending.id,pending.operation] as const]):this.operations;
  this.tab.setItem(this.storageKey,JSON.stringify({...rows,seed:store.seed,
   ...(operations.size?{firstCardOperations:Object.fromEntries(operations)}:{})}));
 }
}
