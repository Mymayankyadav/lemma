import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {ProjectTimeline} from '../../../src/ui/timeline/ProjectTimeline';
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
 it('renders supplied schedule rows instead of recomputing a different pace',()=>{
  const cp:CheckpointView={id:'cp',code:'CP1',title:'Proof',position:1,ui:'now',
   currentStep:1,stepsTotal:4,recheckDue:null,dueCards:0,dueOn:'2035-01-01'};
  const authoritative=buildSchedule([cp],{now:new Date('2034-12-31T12:00:00Z'),
   pacePerWeek:4,targetDate:'2035-01-05'});
  const expected=scheduleDetail(authoritative[0]);
  expect(expected).toBeTruthy();
  const markup=renderToStaticMarkup(createElement(MemoryRouter,null,
   createElement(ProjectTimeline,{project:{title:'Analysis',slug:'analysis',done:0,total:1,
    targetDate:'2035-01-05'},checkpoints:[cp],pacePerWeek:.25,scheduleRows:authoritative})));
  // Both human-readable schedule detail and underlying authoritative metadata
  // must agree; checking only data attributes would weaken FIX #522 parity.
  expect(markup).toContain(expected!);
  expect(markup).toContain('data-schedule-detail');
  expect(markup).toContain('data-route-due-on="'+authoritative[0].dueOn+'"');
  expect(markup).toContain('data-route-schedule-state="'+authoritative[0].state+'"');
  expect(markup).toContain('data-station-state="'+authoritative[0].state+'"');
 });
});
