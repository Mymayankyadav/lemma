import type {ReviewItem} from '../../data/types';

/** Review's optional session chips are only useful for due cards with an
 * authored session reference. The extreme demo has 60,000 virtual sessions
 * but no session-backed due cards, so avoid enumerating them on cold entry.
 */
export function shouldFetchReviewSessions(
 items: readonly Pick<ReviewItem,'sessionNumber'>[] | undefined,
):boolean {
 return items?.some(item=>item.sessionNumber!==null)??false;
}
