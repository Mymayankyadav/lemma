import type {ProjectStatus} from '../../data/types'

type PinSummary={pinned?:boolean;system?:boolean;status:ProjectStatus}

/** One owner-wide pin count for Paths, not a query observer per visible row. */
export function countPinnedProjects(projects:readonly PinSummary[]):number{
 let count=0
 for(const project of projects){
  if(project.pinned&&!project.system&&project.status!=='archived')count++
 }
 return count
}
