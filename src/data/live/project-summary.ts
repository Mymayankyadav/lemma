import type {ProjectSummary,Subject} from '../types'
import type {Row} from './helpers'

const unassigned:Subject={id:'unassigned',name:'Unassigned',glyph:'∫',hue:'slate',position:9999}

/** DB-4 allows a project to exist before the tutor chooses a subject. */
export function summaryMetadata(row:Row,subjects:Map<string,Subject>):
 Pick<ProjectSummary,'subject'|'pinned'|'system'|'targetDate'|'targetLabel'> {
 return {
  subject:subjects.get(row.subject_id)??unassigned,
  pinned:row.pinned===true,
  system:row.system===true,
  targetDate:row.target_date??null,
  targetLabel:row.target_label??null,
 }
}

/** System projects never belong to the owner's visible library or totals. */
export function ownerProjects<T extends {system?:boolean}>(projects:T[]):T[]{
 return projects.filter(project=>!project.system)
}

/** Archived projects remain searchable in the library but never become a resume target. */
export function resumableProjects<T extends {system?:boolean;status:string}>(projects:T[]):T[]{
 return ownerProjects(projects).filter(project=>project.status!=='archived')
}
