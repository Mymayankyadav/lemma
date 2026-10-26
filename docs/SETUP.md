# Lemma setup reference

For work selection and handoff, read [../plan.md](../plan.md). These are setup facts, not a second task queue. Continue the existing repository; do not re-import a ZIP or recreate the backend.

## Resources

- Repository: https://github.com/Mymayankyadav/lemma
- Web: https://mymayankyadav.github.io/lemma/
- Supabase: `yemqnhnztlbyxmjxidis`, region `ap-south-1` (Mumbai).
- Dashboard: https://supabase.com/dashboard/project/yemqnhnztlbyxmjxidis
- Carrel is a separate project; never change its database or repository.

## Build and test

Use the pinned dependencies/lockfile and commands in `package.json`. Current CI uses Node 22, `npm ci`, syntax checks, Chromium installation and `npm test`. `npm run build` bundles the app and essential libraries into `dist/`.

`.github/workflows/test.yml` runs regression checks on `main`, `astra/**` and pull requests. `.github/workflows/pages.yml` separately deploys matching source/build changes on `main`; documentation-only changes do not redeploy Pages.

## Account configuration

GitHub Actions repository variables:

- `SUPABASE_URL`: `https://yemqnhnztlbyxmjxidis.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: the project's public publishable key, never a secret/service-role key.

The build injects these public values. In Supabase Auth, the Site URL and redirect allowlist must support `https://mymayankyadav.github.io/lemma/`; verify current configuration before changing it. Android callbacks need their own tested deep-link setup.

Settings supports optional login and explicit transfer/comparison. Sign-in does not automatically migrate anonymous cards or activate account editing. Follow the sync gates in the canonical plan.

## Backend / native changes

Inspect tracked and applied migrations before changing schema; a checked-in SQL file is not evidence of deployment. Do not run `supabase/legacy_schema_draft.sql` as a bootstrap.

Capacitor dependencies and `capacitor.config.json` exist. Native Android scaffolding and device verification are future work. A web deployment does not update an installed bundled APK.
