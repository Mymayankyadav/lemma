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
