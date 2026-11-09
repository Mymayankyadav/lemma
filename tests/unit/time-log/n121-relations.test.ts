import {describe,expect,it} from 'vitest';
import {changeStudyProject,changeStudySubject} from '../../../src/features/time-log/relations';

const linked={subjectId:'subject-a',projectId:'project-a',checkpointId:'checkpoint-a',sessionId:'session-a'};
describe('N121 time-log named relations',()=>{
 it('clears dependent project, checkpoint and session when subject changes',()=>{
  expect(changeStudySubject('subject-b')).toEqual({subjectId:'subject-b',projectId:'',checkpointId:'',sessionId:''});
 });
 it('selects the project owner subject and clears project-specific links',()=>{
  expect(changeStudyProject(linked,{id:'project-b',subjectId:'subject-b'})).toEqual({
   subjectId:'subject-b',projectId:'project-b',checkpointId:'',sessionId:''
  });
 });
 it('clears project descendants when project is removed but retains the subject',()=>{
  expect(changeStudyProject(linked,null)).toEqual({subjectId:'subject-a',projectId:'',checkpointId:'',sessionId:''});
 });
});
