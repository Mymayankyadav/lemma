import type {ProjectDetail,Proposal} from '../../data/types';
import type {AtlasTree} from '../atlas/tree';
import {buildAtlasTree} from '../atlas/tree';
import {planReviewNodes} from './nodes';
import {planIdeasGraph} from './ideas';
import {groupPlanStages} from './planMap';

/**
 * React StrictMode intentionally replays render-phase calculations. Preparing a
 * large plan change can traverse and sort thousands of proposed ideas, so
 * derive it once per immutable proposal/project snapshot, not once per replay.
 * Weak keys prevent stale plans from being kept alive after React Query evicts
 * them. A changed project or proposal object always gets a fresh result.
 */
const noProject = {};
type Prepared = {
 nodes:ReturnType<typeof planReviewNodes>;
 stages:ReturnType<typeof groupPlanStages>;
 ideaTree:AtlasTree|null;
 ideaCount:number;
};
const empty:Prepared={nodes:[],stages:[],ideaTree:null,ideaCount:0};
const preparedPlans=new WeakMap<Proposal,WeakMap<object,Prepared>>();

export function preparePlanProposal(proposal:Proposal|null|undefined,project:ProjectDetail|undefined):Prepared {
 if(!proposal)return empty;
 let versions=preparedPlans.get(proposal);
 if(!versions){versions=new WeakMap<object,Prepared>();preparedPlans.set(proposal,versions)}
 const projectKey=project??noProject;
 const previous=versions.get(projectKey);
 if(previous)return previous;
 const nodes=planReviewNodes(proposal.plan,proposal.planChange,project?.checkpoints??[]);
 const graph=planIdeasGraph(proposal.plan,proposal.planChange,nodes,proposal.projectSlug,{
  name:project?.subject?.name??'This plan',glyph:proposal.projectGlyph,
 });
 const ideaTree=graph?buildAtlasTree(graph):null;
 const result:Prepared={
  nodes,stages:groupPlanStages(nodes),ideaTree,
  ideaCount:ideaTree?[...ideaTree.nodes.values()].filter(n=>!n.synthetic).length:0,
 };
 versions.set(projectKey,result);
 return result;
}
