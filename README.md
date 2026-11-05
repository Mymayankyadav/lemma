# Lemma (selftest b)

Lemma is a private, proof-first mathematics study app. A React web app (PWA) keeps your plans, cards and reviews in Supabase. An AI tutor connects through an MCP server and can only propose changes, which you approve in the app. Reviews are scheduled with FSRS.

Live app: https://mymayankyadav.github.io/lemma/ (add `?demo=1` for a local demo with no account).

## Run it

```
npm ci
npm run dev      # dev server; demo mode needs no environment variables
npm run check    # typecheck, unit tests, build
npm run e2e      # Playwright end-to-end tests
```

Live mode needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).

- `CURRENT.md` — what exists, how it is built and tested, what is broken.
- `NEXT.md` — the ranked work list.
- `AGENTS.md` — how agents work in this repo.
