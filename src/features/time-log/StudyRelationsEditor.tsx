import {useMemo} from 'react';
import {useProjects,useProject,useSessions,useSubjects} from '../../data/hooks';
import {changeStudyProject,changeStudySubject,type StudyRelationValues} from './relations';

type SelectChange={target:{value:string}};
const field='min-h-11 min-w-0 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label text-ink';
type RelationValues=StudyRelationValues;

/** Human-readable, owner-scoped selectors for the optional learning links. */
export function StudyRelationsEditor({value,onChange}:{value:RelationValues;onChange:(next:RelationValues)=>void}){
 const subjects=useSubjects();
 const projects=useProjects();
 const projectRows=projects.data??[];
 const subjectRows=subjects.data??[];
 const selectedProject=projectRows.find(row=>row.id===value.projectId)??null;
 const choices=useMemo(()=>projectRows.filter(row=>!value.subjectId||row.subject.id===value.subjectId),[projectRows,value.subjectId]);
 return <fieldset className="mt-3 space-y-2">
  <legend className="text-label font-semibold">Learning links <span className="font-normal text-ink-2">(optional)</span></legend>
  <label className="block text-label">Subject
   <select aria-label="Study subject" className={field} value={value.subjectId}
    onChange={(e:SelectChange)=>onChange(changeStudySubject(e.target.value))}>
    <option value="">No subject</option>
    {subjectRows.map(subject=><option key={subject.id} value={subject.id}>{subject.glyph} {subject.name}</option>)}
   </select>
  </label>
  <label className="block text-label">Project
   <select aria-label="Study project" className={field} value={value.projectId}
    onChange={(e:SelectChange)=>{
     const next=projectRows.find(row=>row.id===e.target.value);
     onChange(changeStudyProject(value,next?{id:next.id,subjectId:next.subject.id}:null));
    }}>
    <option value="">No project</option>
    {choices.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}
   </select>
  </label>
  {selectedProject&&<ProjectRelationChoices projectSlug={selectedProject.slug} value={value}
   onChange={onChange}/>}
  {(subjects.isLoading||projects.isLoading)&&<p role="status" className="text-caption text-ink-2">Loading learning links…</p>}
  {(subjects.isError||projects.isError)&&<p role="status" className="text-caption text-ink-2">Some learning links could not be loaded. You can still save without them.</p>}
 </fieldset>;
}

function ProjectRelationChoices({projectSlug,value,onChange}:{projectSlug:string;value:RelationValues;onChange:(next:RelationValues)=>void}){
 const detail=useProject(projectSlug);
 const sessions=useSessions(projectSlug);
 const checkpoints=detail.data?.checkpoints??[];
 const sessionRows=sessions.data??[];
 return <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
  <label className="block min-w-0 text-label">Checkpoint
   <select aria-label="Study checkpoint" className={field} value={value.checkpointId}
    onChange={(e:SelectChange)=>onChange({...value,checkpointId:e.target.value})}>
    <option value="">No checkpoint</option>
    {checkpoints.map(cp=><option key={cp.id} value={cp.id}>{cp.code} · {cp.title}</option>)}
   </select>
  </label>
  <label className="block min-w-0 text-label">Session
   <select aria-label="Study session" className={field} value={value.sessionId}
    onChange={(e:SelectChange)=>onChange({...value,sessionId:e.target.value})}>
    <option value="">No session</option>
    {sessionRows.map(session=><option key={session.id} value={session.id}>Session {session.number} · {session.goal}</option>)}
   </select>
  </label>
  {(detail.isLoading||sessions.isLoading)&&<p role="status" className="text-caption text-ink-2">Loading project details…</p>}
  {(detail.isError||sessions.isError)&&<p role="status" className="text-caption text-ink-2">Checkpoint or session choices are unavailable; other fields can still be saved.</p>}
 </div>;
}
