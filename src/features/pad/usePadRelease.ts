import {useEffect} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {authGeneration, authOwner} from '../../data/authBoundary';
import {getMode} from '../../data/mode';
import {usePlanRelease} from '../../data/usePlanRelease';
import {forgetPadRelease} from './padCheckpoint';

/** Only a confirmed closed release invalidates the previously granted device receipt. */
export function usePadRelease() {
  const released = usePlanRelease('padLocal');
  const mode = getMode(), owner = authOwner(), generation = authGeneration();
  const decision = useQueryClient().getQueryData<boolean>(['plan-release', mode, generation]);
  useEffect(() => {
    if (mode === 'live' && decision === false && owner && generation === authGeneration()) forgetPadRelease(owner);
  }, [mode, decision, owner, generation]);
  return {released, decision};
}
