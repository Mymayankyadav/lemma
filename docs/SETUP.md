# Lemma Setup

## Backend
- Supabase project: `yemqnhnztlbyxmjxidis`
- Dashboard: https://supabase.com/dashboard/project/yemqnhnztlbyxmjxidis
- Region: `ap-south-1` (Mumbai)
- Organization: existing Carrel org, but a separate project and database.
- Initial tables: `study_plans`, `learning_sessions`, `learning_events`, `tutor_handoffs`. These are private via owner RLS.

## GitHub Pages
The existing `.github/workflows/pages.yml` deploys main to GitHub Pages. `.github/workflows/test.yml` runs full regression checks on development branches and PRs.

## Authentication
Configure Supabase Auth URL settings for your final GitHub Pages URL and Android callback before activating sign-in. Do not place secret/service-role keys in the web or Android app. A publishable key is safe with proper RLS.

## Next phase
Continue from the existing source. Follow A4/A5 in `docs/SYNC_AUDIT_2026-10-26.md`; do not re-import a source ZIP or recreate the backend.


## Optional email login (account sign-in is NOT cloud card sync)

Set GitHub Actions repository variables (Settings → Secrets and variables → Actions → Variables):

- `SUPABASE_URL`: `https://yemqnhnztlbyxmjxidis.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: the public `sb_publishable_...` key from the Lemma Supabase project API keys screen; **never** a secret or service-role key.

GitHub Actions injects these **public** values at build time into the static app. After setting them, rerun Deploy Lemma web through the Actions tab. In Supabase Authentication → URL Configuration, add `https://mymayankyadav.github.io/lemma/` to allowed redirects and set its Site URL appropriately before email magic-link use. Android auth requires a separate deep-link implementation and redirect allowlisting.

The Settings account section supports sign-in/out and explicit copy-missing transfers. Current card data stays in original local storage, and must not be automatically migrated. Cloud sync activation remains a subsequent checkpoint requiring tested revision handling, atomic review events, and explicit import safeguards.

