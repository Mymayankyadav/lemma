import {useAtlasModel} from '../../../data/adaptive/atlas-api';
import type {CheckpointView} from '../../../data/types';

export function usePathEstimates(checkpoints: readonly CheckpointView[]) {
  const {data} = useAtlasModel();
  const minutes = (items: readonly CheckpointView[]) => items.reduce((total, checkpoint) => {
    if (checkpoint.ui === 'done') return total;
    return total + (data?.durations[checkpoint.id]?.mean ?? 0);
  }, 0);
  return {minutes, total: minutes(checkpoints), hasCapacity: data?.capacity != null, cardQuota:data?.capacity!=null?data.budget?.quota:undefined};
}

export function hoursEstimate(minutes: number) {
  if (minutes < 60) return Math.round(minutes) + ' min';
  return Math.round(minutes / 60) + ' h';
}
