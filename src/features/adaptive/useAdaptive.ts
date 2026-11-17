import {useQuery} from '@tanstack/react-query';
import {useSettings} from '../../data/hooks';
import {getApi} from '../../data';
import {authSignedOut} from '../../data/authBoundary';
export function useAdaptive(){
 const settings=useSettings(),flags=settings.data?.flags??{};
 const enabled=flags.time_block===true||flags.recheck_v2===true||flags.scheduler_v2===true;
 const query=useQuery({queryKey:['adaptive',flags],enabled:enabled&&!authSignedOut(),staleTime:30_000,refetchInterval:60_000,
  queryFn:async()=>{const now=new Date();const [{assemble},data]=await Promise.all([import('../../../supabase/functions/_shared/adaptive/facts'),getApi().getAdaptiveData(now)]);
   return {...data,state:assemble(data.rows,now)};}});
 return {flags,...query};
}
