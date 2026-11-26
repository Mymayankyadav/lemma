import type {CardIdea} from '../../data/exam/contract'
import {IdeaItem} from './IdeaItem'

export function sortExamIdeas(ideas:readonly CardIdea[],concepts:readonly string[]){
 const relevant=new Set(concepts)
 return [...ideas].filter(idea=>idea.status!=='dismissed').sort((a,b)=>
  Number(!!b.concept&&relevant.has(b.concept))-Number(!!a.concept&&relevant.has(a.concept))||
  b.sightings-a.sightings||(a.created_at??'').localeCompare(b.created_at??'')||a.id.localeCompare(b.id))
}
export function IdeasList({ideas,slug,focused,canEdit,concepts,cardBudget}:{
 ideas:CardIdea[];slug:string;focused?:string|null;canEdit:boolean;concepts:string[];cardBudget:number
}){
 const visible=sortExamIdeas(ideas,concepts)
 if(focused)visible.sort((a,b)=>Number(b.id===focused)-Number(a.id===focused))
 const waiting=visible.filter(item=>item.status==='saved').length
 return <section className="v7-exam-ledger" aria-label="Card ideas">
  {!visible.length&&<p className="v7-exam-empty">No card ideas yet. During exam prep the tutor saves a retrieval idea here when an error repeats or a useful distinction appears, so you can turn it into a card after the exam.</p>}
  {waiting>0&&cardBudget>0&&<p>At {cardBudget} new cards a day, {waiting} saved {waiting===1?'idea takes':'ideas take'} about {Math.ceil(waiting/cardBudget)} {waiting<=cardBudget?'day':'days'}.</p>}
  <ul className="v7-exam-rows">{visible.map(idea=><IdeaItem key={idea.id} idea={idea} slug={slug} canEdit={canEdit}/>)}</ul>
 </section>
}
