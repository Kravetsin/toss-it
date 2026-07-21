# Tossit

A submissions inbox for streamers (a "предложка"): viewers send images, GIFs, videos and
sounds to a streamer's stream, with moderation, a whitelist and limits. Platform-agnostic
(Twitch / Kick / YouTube). Production: https://toss-it.org (self-hosted behind Cloudflare;
legacy https://toss-it.win 301-redirects here, except /api/* which stays live for webhooks).

## Monorepo (pnpm workspace)

- `apps/web` — Vite 8 + React 19 SPA, Tailwind 4, react-router 7. Alias `@/` → `apps/web/src`.
  Feature-first layout: `lib/ ui/ hooks/ providers/ features/ pages/`; pages stay thin.
- `apps/server` — Fastify 5, SQLite (local) / Turso (prod) via Drizzle, socket.io. Serves the
  built frontends in prod; per-route SEO meta + robots/sitemap live in `src/seo.ts`.
- `apps/overlay` — OBS browser-source overlay.
- `packages/shared` — shared TypeScript types.

## Commands (from repo root)

- `pnpm dev` — run server + web + overlay together.
- `pnpm -r typecheck` — typecheck every package.
- `pnpm build` — build all.
- `pnpm lint` — eslint.
- `pnpm format` — prettier. NOTE: `prettier --write .` rewrites the WHOLE repo; format only the
  files you actually changed, not the whole tree.

## Conventions

- **English everywhere in code artifacts** — comments, commit messages, plans, docs, identifiers.
  Product UI copy is localized separately in `apps/web/src/i18n`; the Russian/Ukrainian strings
  there are data, not comments — never "translate" or remove them.
- **Comments**: only non-obvious "why" (rationale, gotchas, constraints, invariants); ≤2 lines;
  never restate what the code does. Keep directive comments verbatim (`eslint-disable`, etc.) and
  the `<!--SEO-->` / `<!--/SEO-->` markers in `apps/web/index.html`.
- **Commits**: ≤2 lines, English, imperative mood.
- **Plans / design docs**: English, concise. Delete them once done instead of letting them rot.
