import {useQuery} from '@tanstack/react-query'
import {isFlagOn, type FlagName} from '../flags'
import {authGeneration} from './authBoundary'
import {getMode} from './mode'

/** A live build can arrive before its server. Expose the feature once both are ready. */
export function usePlanRelease(flag: FlagName, observed = true): boolean {
  const enabled = isFlagOn(flag)
  const mode = getMode()
  const release = useQuery({
    queryKey: ['plan-release', mode, authGeneration()],
    enabled: observed && enabled && mode === 'live',
    queryFn: async () => {
      const {liveClient} = await import('./live/client')
      const {data, error} = await liveClient().rpc('lemma_plan_released')
      if (error) throw error
      return data === true
    },
  })
  return enabled && (mode === 'demo' || (release.isSuccess && release.data === true))
}
