import type {ProjectSummary} from '../../data/types'

// A large desk uses the same bounded goal presentation without waiting for a
// second JS chunk after the Home query settles. This is based on active
// project count, not a demo/stress URL flag; small desks keep lazy full Metro.
export function shouldUseFastGoals(projects:readonly ProjectSummary[]):boolean{
 let active=0
 for(const project of projects){
  if(project.status==='active'&&++active>4)return true
 }
 return false
}
