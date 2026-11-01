import type {QueryClient} from '@tanstack/react-query'
import type {DataMode} from '../../data/mode'

/** Paths is the natural entry to Atlas. Warm its canonical query only in
 * demo: a Paths visit must never introduce an extra live-network request.
 * React Query deduplicates in-flight loads with the eventual useAtlas hook.
 */
export function prefetchAtlasForPaths<T>(
 queryClient:Pick<QueryClient,'prefetchQuery'>,
 mode:DataMode,
 load:()=>Promise<T>,
):Promise<void>{
 if(mode!=='demo')return Promise.resolve()
 return queryClient.prefetchQuery({queryKey:['atlas'],queryFn:load,staleTime:30_000})
}
