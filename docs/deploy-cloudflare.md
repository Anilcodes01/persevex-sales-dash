# Deploy to Cloudflare from your terminal

Run these steps from `/Users/anilpal/Desktop/persevex-sales-dash`. You perform
the deployment and browser checks yourself. The project uses Workers, not Pages.

## 1. Sign in to Cloudflare

```sh
npx wrangler login
npx wrangler whoami
```

The first command opens a Cloudflare authorisation page. Complete it, then use
`whoami` to confirm the correct account. Keep the Workers Free plan.

## 2. Configure the deployment account

Your `.env` already contains `CLOUDFLARE_WORKERS_PAGES_ACCOUNT_ID`. Run:

```sh
npm run cf:configure
```

This copies only the Account ID into `wrangler.jsonc` as `account_id`. Account
IDs are configuration, not secrets. Your account controls the `workers.dev`
subdomain; it is not manually set by the application.

The configuration already names the Worker `persevex-sales-dash`, exports the
`Organisation` Durable Object, binds it as `ORGANISATION`, and registers SQLite
storage with the `v1` class migration. You do not create a separate database
in the Cloudflare dashboard. Do not rename/delete this binding or migration
to solve a deployment error.

## 3. Check the build

```sh
npm run cf:check
npm run typecheck:worker
npm run lint
```

The dry run builds `out/` and checks the Worker bundle without deploying.
Browser/runtime testing is your next step after deployment.

## 4. Publish the application

```sh
npm run cf:deploy
```

This builds the frontend, uploads its assets and the Worker, and registers the
Durable Object namespace on the first deployment. Use the URL Wrangler prints.
For the configured name and your account subdomain, it should be:

`https://persevex-sales-dash.aceospec.workers.dev`

Open the URL and `/api/health`. The health endpoint should show `status: ok`,
`storage: sqlite`, and `schemaVersion: 4`.

## 5. Set up a production administrator

Local SQLite data in `.wrangler/` is not uploaded. The deployed application
starts with its own database, so the local admin cannot sign in until you
create a production account. Later deployments preserve this production data.

Generate a new setup secret:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value privately. It is a value, not a command. Then run:

```sh
npx wrangler secret put BOOTSTRAP_ADMIN_SECRET
```

Paste the value only when Wrangler prompts for the secret, then press Enter.
`.dev.vars` is for local development; it does not provision deployed secrets.

Create `.env.admin.production.json` in the project root with this structure:

```json
{
  "secret": "PASTE_THE_SAME_NEW_SETUP_SECRET_HERE",
  "email": "your-admin-email@example.com",
  "displayName": "Your Name",
  "password": "CHOOSE_YOUR_OWN_PRIVATE_PASSWORD"
}
```

Choose a new private password of 15–128 characters. Do not use the example
placeholder. This file is ignored by Git. Save it, then run:

```sh
node scripts/bootstrap-admin.mjs https://persevex-sales-dash.aceospec.workers.dev .env.admin.production.json
```

Use the actual deployed URL if it differs. Wait for `Administrator created`,
then sign in through the website. There is no public registration page.

## 6. Close initial setup

After successfully signing in, remove the bootstrap secret:

```sh
npx wrangler secret delete BOOTSTRAP_ADMIN_SECRET
```

Delete the temporary `.env.admin.production.json` file from your editor. Normal
sign-in and account management do not require the bootstrap secret. Removing
it does not delete accounts. Bootstrap also rejects setup once an account exists.

## 7. Check the admin flow in your browser

1. Sign in as the admin; check that the People directory appears.
2. Add a synthetic employee with a temporary password.
3. Refresh and confirm the account persists; check search and role/status filters.
4. Edit the employee's name/email and verify the updated row.
5. Sign out and sign in as the employee; change the temporary password.
6. Sign in again and confirm there are no admin controls for that employee.
7. Return as admin and disable/reactivate the employee; check login behaviour.
8. Reset their password; verify they must choose a new password again.

This release manages accounts. Targets, sales entry and leaderboard
metrics are not implemented yet. Dashboard counts represent accounts, not sales.

## Future updates

Run `npm run cf:deploy` after changes. Keep the Worker name, Account ID and
Durable Object identity stable. Deploying updates does not import local data
or reset the production database. Schema changes need explicit migrations.

## Troubleshooting

- **Not authenticated:** run `npx wrangler login` and complete authorisation.
- **Wrong account/multiple accounts:** rerun `cf:configure` with the right ID.
- **Setup unavailable:** set the deployed bootstrap secret; `.dev.vars` is local.
- **Initial account already exists:** bootstrap succeeded earlier; use that login.
- **Email already has an account:** edit/reactivate the existing account.
- **Worker has no default export / missing class:** share the error; keep the
  class re-export in `worker/index.ts` and its matching Wrangler migration.

References: [Cloudflare configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
[local secrets](https://developers.cloudflare.com/workers/local-development/environment-variables/),
[Durable Object setup](https://developers.cloudflare.com/durable-objects/get-started/).
