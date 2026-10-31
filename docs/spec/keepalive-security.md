# Keepalive privilege clarification

This is an additive clarification of data.md §5.6. The `ping()` RPC continues to return `now()` and remains executable by `anon`; it accesses no tables. Implement this pure timestamp function as `SECURITY INVOKER` rather than granting it elevated privileges. All other function, table and storage permissions in data.md remain in force.

Supabase's current security advisor reports both anonymous and authenticated execution warnings for a publicly callable `SECURITY DEFINER` function, even when it only returns the timestamp. Invoker execution preserves the public keepalive API and removes both warnings.
