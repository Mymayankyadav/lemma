# Lemma Setup

## Backend
- Supabase project: `yemqnhnztlbyxmjxidis`
- Dashboard: https://supabase.com/dashboard/project/yemqnhnztlbyxmjxidis
- Region: `ap-south-1` (Mumbai)
- Organization: existing Carrel org, but a separate project and database.
- Initial tables: `study_plans`, `learning_sessions`, `learning_events`, `tutor_handoffs`. These are private via owner RLS.

## GitHub Pages
Go to GitHub repository Settings → Pages → Build and deployment → GitHub Actions. The build workflow will be added when Phase 1 sources are imported.

## Authentication
Configure Supabase Auth URL settings for your final GitHub Pages URL and Android callback before activating sign-in. Do not place secret/service-role keys in the web or Android app. A publishable key is safe with proper RLS.

## Next phase
Import the prepared Phase 1 source ZIP into this repository, complete the remaining schemas for cards and sources, then implement auth, offline mutation queue, idempotent review events, realtime invalidation and full cross-device tests.


## Optional email login (account sign-in is NOT cloud card sync)

Set GitHub Actions repository variables (Settings → Secrets and variables → Actions → Variables):

- `SUPABASE_URL`: `https://yemqnhnztlbyxmjxidis.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: the public `sb_publishable_...` key from the Lemma Supabase project API keys screen; **never** a secret or service-role key.

GitHub Actions injects these **public** values at build time into the static app. After setting them, rerun Deploy Lemma web through the Actions tab. In Supabase Authentication → URL Configuration, add `https://mymayankyadav.github.io/lemma/` to allowed redirects and set its Site URL appropriately before email magic-link use. Android auth requires a separate deep-link implementation and redirect allowlisting.

The Settings account section only signs users in/out. Current card data stays in original local storage, and must not be automatically migrated. Cloud sync activation remains a subsequent checkpoint requiring tested revision handling, atomic review events, and explicit import safeguards.
