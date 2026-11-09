export interface StudyRelationValues {
 subjectId:string;
 projectId:string;
 checkpointId:string;
 sessionId:string;
}

/** A subject switch invalidates all descendants of the previous subject. */
export function changeStudySubject(subjectId:string):StudyRelationValues{
 return {subjectId,projectId:'',checkpointId:'',sessionId:''};
}

/** A project switch updates its owning subject and clears project-specific links. */
export function changeStudyProject(
 value:StudyRelationValues,
 project:{id:string;subjectId:string}|null,
):StudyRelationValues{
 return {
  subjectId:project?.subjectId??value.subjectId,
  projectId:project?.id??'',
  checkpointId:'',
  sessionId:'',
 };
}
