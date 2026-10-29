-- CONTRACT #219: ping needs no elevated privileges; its public API is unchanged.
alter function public.ping() security invoker;
