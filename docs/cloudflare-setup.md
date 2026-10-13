# Cloudflare foundation

The Next.js frontend exports to `out/`. Cloudflare Workers serves these assets
and routes `/api/*` through `worker/index.ts`. See `docs/codebase.md` for the
separate route, storage and security modules. The `ORGANISATION` binding points to
the SQLite-backed `Organisation` Durable Object, selected by the stable name
`persevex`. Its initial table contains schema metadata only.

Production builds use the supported Next.js Webpack option and Tailwind's PostCSS
plugin. System fonts remove the external Google Fonts download at build time.

## Commands

- `npm run dev`: start Next.js hot reload and the local Cloudflare backend together.
  Open localhost:3000. See `docs/local-development.md`.

- `npm run typecheck:worker`: check the backend types.
- `npm run cf:check`: build the frontend and bundle a deployment locally, without uploading it.
- `npm run cf:dev`: build and start the local Cloudflare runtime. Run only when requested.
- `npm run cf:deploy`: build and deploy. Run only after deployment is authorised.

Before the first deployment, run `npx wrangler login` and `npx wrangler whoami`
to confirm the intended account. Wrangler can use the authenticated account;
if multiple accounts exist, set its standard `CLOUDFLARE_ACCOUNT_ID` environment
variable to the Account ID saved in `.env`. The current custom
`CLOUDFLARE_WORKERS_PAGES_ACCOUNT_ID` name is not automatically mapped by Wrangler.
Do not expose account configuration through `NEXT_PUBLIC_` variables.

The account subdomain is `aceospec.workers.dev`. With the configured Worker name,
the expected initial address is `persevex-sales-dash.aceospec.workers.dev`.
This address is not live until deployment.

## Verification after starting the runtime

`GET /api/health` checks the Durable Object's persistent schema metadata and
returns `status: ok`, `storage: sqlite`, and `schemaVersion: 4`. Storage failures
return HTTP 503. Unknown API paths return HTTP 404.

Application-managed password authentication is implemented; see
`docs/authentication.md` for setup and endpoints. Employee business records,
sales endpoints and live subscriptions are not implemented yet. Finalise
sale/collection approval and correction rules before adding them.

## Frontend constraints

This is a static Next.js export. Runtime API routes, Server Actions, server-side
cookies and other dynamic Next.js server features belong in the Worker instead.
Frontend pages can fetch authenticated data from the same-origin Worker API.
Static HTML must never contain employee-specific or secret data.

## Persistence and migrations

The Wrangler `v1` migration registers a SQLite Durable Object class. Application
SQL migrations are separate and must evolve the ledger without deleting history.
In-memory state is disposable. Keep `.env`, `.dev.vars`, and `.wrangler` ignored.
The existing Prisma dependencies are retained, but this foundation uses the
Durable Object SQL API directly.
