# Application authentication

Accounts use normalised email addresses and salted scrypt hashes via
`@noble/hashes`. The versioned profile is N=16384, r=8, p=5, with a 16-byte salt
and 32-byte derived key. It is one of OWASP's minimum scrypt profiles:
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
Password length is 6–128 characters; passwords are never trimmed.

Hashing runs in the organisation Durable Object. Benchmark real Cloudflare CPU,
duration and concurrent login impact before rollout: Node tests are not platform
capacity evidence. Hashing currently occupies the organisation coordinator while
it executes. If login bursts affect leaderboard latency, isolate credential
verification in a separate object before launch.

## Initial administrator (only when ready to start the runtime)

1. Generate a random setup secret with at least 32 random bytes. Store it locally
   as `BOOTSTRAP_ADMIN_SECRET` in `.dev.vars`, which is ignored. In production,
   provision it using Cloudflare secret storage, never a public frontend variable.
2. Create an ignored `.env.admin.json` file containing `secret`, `email`,
   `displayName`, and `password`. Use a development-only account for local testing.
3. Once the Cloudflare runtime is running by explicit request, run:
   `node scripts/bootstrap-admin.mjs http://localhost:8787 .env.admin.json`
4. Sign in at the same origin. Remove the temporary credentials file and setup
   secret after setup. Bootstrap refuses any further creation once an account
   exists, even if the secret remains configured.

`npm run dev` starts Next.js and the local Cloudflare backend together, forwarding
API requests from localhost:3000. A standalone Next.js process still needs a
running backend. See `docs/local-development.md`. Secure cookies
work on browser localhost; production requires HTTPS. Do not deploy real
credentials over HTTP.

## API

All mutations require same-origin `Origin` and JSON bodies (4 KiB maximum).
There is no public registration endpoint.

| Endpoint                             | Method | Body / behaviour                                                              |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| `/api/auth/bootstrap`                | POST   | Setup secret, email, displayName, password; initial admin only                |
| `/api/auth/login`                    | POST   | Email and password; sets session cookie                                       |
| `/api/auth/me`                       | GET    | Current account; no password hash or token in JSON                            |
| `/api/auth/logout`                   | POST   | Revokes current session and clears cookie                                     |
| `/api/auth/password`                 | POST   | currentPassword, newPassword; revokes all sessions                            |
| `/api/admin/accounts`                | POST   | email, displayName, role, password; admin only                                |
| `/api/admin/accounts`                | GET    | Searchable roster with role/status filters, pagination and counts; admin only |
| `/api/admin/accounts/update`         | POST   | accountId, email, displayName, role; admin only                               |
| `/api/admin/accounts/enable`         | POST   | accountId; reactivates an account                                             |
| `/api/admin/accounts/disable`        | POST   | accountId; disables account and revokes sessions                              |
| `/api/admin/accounts/reset-password` | POST   | accountId, password; requires change on next login                            |

New employee/manager/admin accounts sign in directly to their dashboard using
the password set during creation, without a mandatory first-login change.
Administrator password resets still require a change at next sign-in.
The initial administrator sets their
own password. Password changes require a fresh sign-in. Manager team assignments
and employee business records will be separate from login accounts.

Sessions use random 256-bit tokens, store only SHA-256 token hashes, expire after
seven days, and are limited to five concurrent sessions per account. Cookies are
`__Host-` prefixed, Secure, HttpOnly, SameSite=Strict, with Path=/ and no Domain.
Permissions and active status are read from storage, not client-supplied roles.

Fixed 15-minute throttles allow 10 login attempts per normalised email, 1,000
login/setup attempts per IP (to accommodate shared office networks), and 30
protected mutations per authenticated account. Expired limiter rows are cleaned
up on use. Successful attempts count too. These limits need pilot validation;
additional edge abuse controls may be needed for public rollout.

Audit records contain actor/action/subject/time, never passwords, tokens or
submitted request payloads. Automated reset email and MFA are not implemented.
Administrators can create, search, edit, disable, reactivate and reset accounts
from the People directory. Employees and managers cannot access these APIs.
An administrator cannot disable themselves or remove their own admin role.

See `docs/deploy-cloudflare.md` for production setup, which is separate from local
development accounts and `.dev.vars` secrets.

## Manual sign-in check

After initial administrator setup, sign in and confirm that the account screen
shows your name and role. Reload to check that the session persists. Use the
account creation form to create a synthetic employee with a temporary password.
Sign out, sign in as that employee, and confirm that password change is required.
Save a new password, sign in again, reload, and sign out. An incorrect password
should show a generic login error. No public self-registration is available.

`npm run cf:dev` builds the static frontend and serves both the frontend and API
at the local URL printed by Wrangler (normally `http://localhost:8787`).
`npm run dev` starts both processes with UI hot reload at localhost:3000.
`npm run cf:dev` remains the build-once Cloudflare preview.

## Checks

`npm run test:auth` runs actual SQLite-backed tests with a stub Durable Object
base class, without a server. They check authentication, expiry, role isolation,
temporary-password enforcement, disabling, logout, revocation, origin rejection,
oversized requests and persistent throttling. A Cloudflare runtime test remains
required before rollout.
