# Pinterest Video Downloader

A full-stack utility that turns public Pinterest pin links into direct video download options.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/pinterest-downloader run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pinterest-downloader/src/App.tsx` — responsive downloader interface and states
- `artifacts/pinterest-downloader/src/index.css` — soft-pink visual theme and motion
- `artifacts/api-server/src/routes/download.ts` — Pinterest redirect, metadata, and MP4 extraction
- `lib/api-spec/openapi.yaml` — source of truth for the download API contract

## Architecture decisions

- Pinterest HTML is fetched server-side with a browser-like user agent so video URLs are never exposed to a client-side cross-origin scrape.
- `pin.it` links are resolved through the fetch response's final URL before pin validation and extraction.
- Direct MP4 URLs are deduplicated and quality-labeled from their path, with an `og:video:secure_url` fallback.

## Product

- Accepts Pinterest pin links and shows title, thumbnail, and downloadable video qualities.
- Supports loading, empty, error, retry, and success states without sign-in or persistence.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Pinterest can change its page markup or restrict individual pins; the API reports unreachable and no-video cases separately.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
