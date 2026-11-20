import {useEffect} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {authGeneration, authOwner} from '../../data/authBoundary';
import {getMode} from '../../data/mode';
import {isFlagOn} from '../../flags';
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
  // A background error preserves the last server decision in this generation's
  // query. Do not unmount an authorized editor (and its unsaved work) merely
  // because refreshing that decision failed. A new account/generation has its
  // own key; a confirmed false still closes access and clears the device receipt.
  const localAccess = released || (isFlagOn('padLocal') && mode === 'live' && !!owner && decision === true);
  return {released: localAccess, decision};
}
