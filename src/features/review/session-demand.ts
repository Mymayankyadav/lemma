import type {ReviewItem,SessionSummary} from '../../data/types';

/** Review's optional session chips are only useful for due cards with an
 * authored session reference. The extreme demo has 60,000 virtual sessions
 * but no session-backed due cards, so avoid enumerating them on cold entry.
 */
export function shouldFetchReviewSessions(
 items: readonly Pick<ReviewItem,'sessionNumber'>[] | undefined,
):boolean {
 return items?.some(item=>item.sessionNumber!==null)??false;
}

/** Count only eligible cards with a session reference. Preserve the
 * listSessions() order, which controls the first three chip suggestions.
 * Avoid the old sessions × due-cards nested scan at stress scale.
 */
export function groupReviewSessions(
 sessions:readonly SessionSummary[],
 items:readonly Pick<ReviewItem,'projectSlug'|'sessionNumber'>[],
):Array<SessionSummary&{count:number}> {
 const byProject=new Map<string,Map<number,number>>();
 for(const item of items){
  if(item.sessionNumber===null)continue;
  let counts=byProject.get(item.projectSlug);
  if(!counts){counts=new Map();byProject.set(item.projectSlug,counts);}
  counts.set(item.sessionNumber,(counts.get(item.sessionNumber)??0)+1);
 }
 const selected:Array<SessionSummary&{count:number}>=[];
 for(const session of sessions){
  const count=byProject.get(session.projectSlug)?.get(session.number)??0;
  if(!count)continue;
  selected.push({...session,count});
  if(selected.length===3)break;
 }
 return selected;
}
