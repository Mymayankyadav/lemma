import {describe,it,expect} from 'vitest';
import type {CheckpointView,Project,ProjectDetail} from '../../../src/data/types';
import {buildSchedule,scheduleDetail} from '../../../src/lib/schedule';
import {scheduleForProject} from '../../../src/ui/timeline/progress';

describe('FIX #522 checkpoint and Metro schedule parity',()=>{
 it('uses the same plan-based pace for a new project, not a fixed historical baseline',()=>{
  const now=Date.parse('2026-10-31T12:00:00Z');
  const project:Project={
   id:'p',slug:'analysis',title:'Analysis',goal:'Qualify',style:'socratic',
   status:'active',subjectId:'s',createdAt:'2026-10-30',targetDate:'2026-11-10',
  };
  const checkpoints:CheckpointView[]=[
   {id:'cp1',code:'CP1',title:'Compactness',position:1,ui:'now',
    currentStep:1,stepsTotal:5,recheckDue:null,dueCards:0,dueOn:'2026-11-04'},
   {id:'cp2',code:'CP2',title:'Continuity',position:2,ui:'next',
    currentStep:0,stepsTotal:5,recheckDue:null,dueCards:0,dueOn:'2026-11-10'},
  ];
  const detail:Pick<ProjectDetail,'project'|'checkpoints'|'done'|'total'>={
   project,checkpoints,done:0,total:2,
  };
  const {estimate,rows}=scheduleForProject(detail,[],now);
  expect(estimate.source).toBe('plan');
  expect(estimate.pace).toBeGreaterThan(1);
  const metro=buildSchedule(checkpoints,{
   targetDate:project.targetDate,pacePerWeek:estimate.pace??undefined,now:new Date(now),
  });
  expect(scheduleDetail(rows[0])).toBe(scheduleDetail(metro[0]));
  expect(scheduleDetail(rows[0])).toContain('Planned 4 Nov');
  expect(scheduleDetail(rows[0])).not.toContain('days late');
 });
});
