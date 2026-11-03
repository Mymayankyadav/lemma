# NEXT — ranked by the priority run. Take the top open item whose Needs are all done.

## N1 Fix deployment
Stage: Stable · Status: open · Needs: — · Assigned: —
Done = the pending migrations are applied to the remote database in timestamp order through the normal deploy workflow, the deploy workflow is green on main, and the MCP smoke test passes.
Scope: supabase/migrations/**, .github/workflows/* (deploy only), supabase/functions/** only if the smoke test requires it.
Not: app UI, test thresholds, new migrations unrelated to ordering.

(More items are added by the priority run.)
