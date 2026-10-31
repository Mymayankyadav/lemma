import type {QueryClient} from '@tanstack/react-query'
import type {DataMode} from '../../data/mode'

/** Paths is the natural entry to Atlas. Warm the existing canonical query only
 * in the local demo: the full 2,500-idea stress graph stays virtual on Today,
 * and opening Paths must never introduce an extra live-network request.
 *
 * React Query shares in-flight fetches with useAtlas(), so an immediate tap
 * neither duplicates the graph build nor changes the actual Atlas contents.
 */
export function prefetchAtlasForPaths<T>(
 queryClient:Pick<QueryClient,'prefetchQuery'>,
 mode:DataMode,
 load:()=>Promise<T>,
):Promise<void>{
 if(mode!=='demo')return Promise.resolve()
 return queryClient.prefetchQuery({queryKey:['atlas'],queryFn:load,staleTime:30_000})
}
