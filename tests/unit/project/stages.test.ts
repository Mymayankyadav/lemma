import {describe,it,expect} from 'vitest';
import {groupStages} from '../../../src/features/project/PathsView';
import type {CheckpointView} from '../../../src/data/types';

function cp(code:string,stage:string|null,ui:CheckpointView['ui']='locked'):CheckpointView {
 return {id:code,code,title:'Checkpoint '+code,position:Number(code.slice(2)),stage,ui,
  currentStep:0,stepsTotal:3,recheckDue:null,dueCards:0};
}

describe('Euclid Paths stage grouping',()=>{
 it('preserves the plan order and does not mislabel missing stages',()=>{
  const groups=groupStages([
   cp('CP1','Foundations','done'),cp('CP2','Foundations','now'),
   cp('CP3','Proofs'),cp('CP4',null),cp('CP5',null)
  ]);
  expect(groups.map(group=>group.name)).toEqual(['Foundations','Proofs','CP4–CP5']);
  expect(groups.map(group=>group.checkpoints.map(item=>item.code)))
   .toEqual([['CP1','CP2'],['CP3'],['CP4','CP5']]);
 });
 it('keeps noncontiguous repeated stage names in their original position',()=>{
  expect(groupStages([cp('CP1','A'),cp('CP2','B'),cp('CP3','A')]).map(group=>group.name))
   .toEqual(['A','B','A']);
 });
 it('does not mutate checkpoint input',()=>{
  const checkpoints=[cp('CP1',null)];
  const groups=groupStages(checkpoints);
  expect(groups[0].checkpoints[0]).toBe(checkpoints[0]);
  expect(checkpoints).toHaveLength(1);
 });
});
