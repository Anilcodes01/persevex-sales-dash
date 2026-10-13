# UI hot reload with the local Cloudflare backend

Run `npm run dev` and open **http://localhost:3000**. This starts:

- Next.js on port 3000, with Fast Refresh for UI edits.
- Wrangler on port 8787, with local Durable Object storage and backend watching.

Next forwards `/api/*` requests to Wrangler. The browser stays on port 3000;
session cookies and API calls remain on the same browser origin. Keep using
`localhost:3000` rather than switching between localhost and 127.0.0.1.

No production build is needed before development. Wrangler serves the existing
`public/` directory as its placeholder assets; Next serves all frontend routes.
Stop an existing `cf:dev` session first so port 8787 is available. Wait until
both processes report ready, then sign in. Use Ctrl+C to stop both.

## Files and persistence

`scripts/dev.mjs` generates the ignored `.wrangler.dev.json` from the production
configuration, preserving the Worker name, bindings and Durable Object class
migrations. It sets only local origin variables and launches both processes.
Local secrets still come from `.dev.vars` in the repository root.

The backend explicitly uses `.wrangler/state`, the same local database as the
existing `cf:dev` command. Existing local accounts are retained. Deployed
accounts remain separate and are not copied to local storage.

Next development output goes to `.next-dev/`; production output remains in
`.next/` and `out/`. Rewrites are enabled only for Next development. Production
builds remain static exports served by Cloudflare.

## Origin checks

The local Worker accepts `http://localhost:3000` as a mutation origin only when
the generated local-development flag is set and the request target is loopback.
The deployed Worker keeps its strict same-origin checks. Do not copy the local
configuration into production or deploy `.wrangler.dev.json`.

## Commands

| Command                        | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `npm run dev`                  | Hot-reloading frontend and local backend together              |
| `npm run dev:backend`          | Local backend alone on port 8787                               |
| `npm run dev:frontend`         | Next frontend alone; expects the backend on port 8787          |
| `npm run cf:dev`               | Build once, then preview the Cloudflare-served static frontend |
| `npm run cf:deploy`            | Build and publish the production application                   |
| `node scripts/dev.mjs --check` | Prepare/validate configuration without starting servers        |

For a fresh local admin, the existing bootstrap script can target
`http://localhost:3000` through the proxy once both processes are ready, or target
the backend directly at `http://127.0.0.1:8787`. If you already have a local
admin, just sign in. Do not rerun production bootstrap for local development.

## Manual verification

1. Start `npm run dev` yourself and sign in at localhost:3000.
2. Edit a visible heading in a component and save. It should update without a build.
3. Create/edit a synthetic account to confirm POST requests pass origin checks.
4. Reload the page and confirm your session persists.
5. Sign out and confirm the session is revoked.
6. Stop with Ctrl+C and confirm both ports are released.

The setup was checked without starting servers or running browser tests.
