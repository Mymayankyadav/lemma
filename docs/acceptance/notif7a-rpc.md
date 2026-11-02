# NOTIF-7a — bounded notification Review queue RPC

The existing `public.review_items` applies the saved `reviews_per_day` quota before the Review page receives cards. A one-shot `#/review?start=5` cannot recover five due cards when that quota is three. This independently mergeable migration supplies a **separate read-only RPC** without changing ordinary Start.

Acceptance:
- One request returns at most 50 otherwise-due owner-visible cards in the existing priority/sibling order, with the same deck/session/concept/new filters.
- A notification requesting five can return five when the saved daily review goal is three; ordinary `review_items` still returns three and the saved setting is unchanged.
- Keep the distinct `new_per_day` safety cap; no writes, RLS changes, unbounded client transfer or cross-owner rows.
- Test both reads, prefix parity, cap, owner isolation and ordinary behavior in the isolated PostgreSQL harness. Do not use the owner's Supabase data.
- The consumer contract is separate PR #745; UI integration is #717 after dependencies merge.

This document is a task acceptance record, not a claim of tests or deployment.
