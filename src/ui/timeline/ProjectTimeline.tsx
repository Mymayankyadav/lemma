import type {CheckpointView} from '../../data/types';
import type {ScheduledCheckpoint} from '../../lib/schedule';
import {Route} from './Route';

export type TimelineVariant='ascent'|'metro';
export interface ProjectTimelineProps{
 project:{title:string;slug:string;done:number;total:number;targetDate?:string|null};
 checkpoints:readonly CheckpointView[];
 variant?:TimelineVariant;
 height?:number;
 mini?:boolean;
 pacePerWeek?:number;
 scheduleRows?:readonly ScheduledCheckpoint[];
}

/** Compatibility adapter for older callers and isolated fixtures.
 * The stage-button and station-button rails have been retired: there is
 * exactly one Route at every scale, including legacy ProjectTimeline usage.
 */
export function ProjectTimeline({project,checkpoints,mini=false,pacePerWeek,scheduleRows}:ProjectTimelineProps){
 return <Route project={project} checkpoints={checkpoints} mode={mini?'today':'project'}
  pacePerWeek={pacePerWeek} scheduleRows={scheduleRows}/>;
}
