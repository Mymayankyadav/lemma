import {useReviewSession} from '../../../features/review-run/store'

// Only Review needs this subscription and the review queue it imports.
// Keeping it in a route-scoped chunk avoids parsing scheduling code when
// Today, Paths or Insights merely draw their static graph-paper letterhead.
export default function ReviewCurve({path,opacity}:{path:string;opacity:number}){
 const completedRound=useReviewSession(state=>state.completedRound)
 return completedRound?<path d={path} fill="none" stroke="var(--accent)"
  strokeWidth="1.5" opacity={opacity} strokeDasharray="3 5"/>:null
}
