# ABASSI Telegram Mini App

## Local development

Requirements: Node.js 24+ and npm. From this directory:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run test
npm.cmd run dev
```

The frontend runs at <http://127.0.0.1:5173>; the Fastify API runs at
<http://127.0.0.1:8787>. Both bind to loopback only. The Vite development server proxies `/api` to the API.
Check <http://127.0.0.1:8787/api/v1/health> for service status and
<http://127.0.0.1:8787/api/v1/ready> for database readiness.
The backend loads `.env` from the workspace root based on its module path, not
the shell's current directory.

With no `.env`, the app starts in safe preview mode. It does not create real
accounts or award points without authenticated Telegram `initData` and a
configured database. Create a local `.env` from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Then edit `.env` locally. Never put server secrets in `VITE_*` variables.

**Security action required:** a bot token was previously present in this
workspace's `.env.example`. Treat it as compromised. Revoke/regenerate it with
BotFather before adding a replacement to `.env`; the example file has been
sanitized and must remain placeholder-only.

## Environment variables

- `TELEGRAM_BOT_TOKEN`: BotFather token; backend only. Never commit it or put it
  in frontend code.
- `TELEGRAM_BOT_USERNAME`: configured bot username, without `@`.
- `DATABASE_URL`: PostgreSQL URI (`postgresql://...` or `postgres://...`) for
  the backend. For Supabase, copy a PostgreSQL connection URI from **Project
  Settings → Database → Connection string**. Prefer a direct database connection
  or session-mode pooler for migrations; the migration runner uses a
  session-level advisory lock. A Supabase project URL such as
  `https://<project>.supabase.co` is not a database connection URI.
- `DATABASE_SSL`: keep enabled for Supabase connections.
- `APP_ORIGIN` and `API_PORT`: local frontend origin and API port.
- `DAILY_CHECKIN_ENABLED`: remains `false` until the rewards policy has been
  approved. Ads, wallet connections, settlement, and transfers are not
  enabled by configuration.
- `PUBLIC_URL_X`, `PUBLIC_URL_TELEGRAM`, `PUBLIC_URL_ANNOUNCEMENTS`, and
  `PUBLIC_URL_WEBSITE`: optional public HTTPS destinations. The backend
  sanitizes these and exposes only safe URLs from `/api/v1/config`; configured
  task destinations are reused as fallbacks for X and Telegram. Unset or
  invalid links are omitted from the interface.

All social URLs are backend environment values, not `VITE_*` variables. Bot
tokens, database URIs, CA paths, and provider secrets stay backend-only. The
`.env.example` file contains placeholders only; copy it to `.env` and set your
own verified values locally.

`.env` and other `.env.*` files are excluded from Git; `.env.example` must only
contain placeholders.

See [docs/PRODUCTION-HANDOVER.md](docs/PRODUCTION-HANDOVER.md) for the current
feature inventory, production-readiness decision, verified limitations, and
owner configuration checklist.

## Database migration

Review `server/migrations/001_core.sql` before running it. The migration
creates application tables/indexes and append-only ledger triggers; it does
not drop application tables or user rows. It replaces only its named ledger
trigger/function definitions; the runner refuses to proceed if it finds
untracked ABASSI tables, missing/out-of-order migration files, or the named
function without migration history. Once `DATABASE_URL` points to the intended database, the migration command
prints only the database name and hostname (never the URI or password), then
checks the migration history and ABASSI table names. It refuses to run if it
finds ABASSI tables without matching history, missing migration files, or an
out-of-order history. For an independent read-only review, query:

```sql
SELECT current_database(), current_user;
SELECT to_regclass('public.schema_migrations');
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Only continue if the target database and existing application tables are the
expected ones. If the preflight finds an existing or partial ABASSI schema, it
stops without applying DDL; review that schema before deciding how to proceed.
Then apply:

```powershell
npm.cmd run db:migrate
```

The runner records applied migration filenames and uses a PostgreSQL advisory
lock. Do not run it against production without a reviewed backup and an
explicit deployment plan.

Migration `003_enable_public_rls.sql` enables RLS without creating client
policies; the trusted backend database role remains the only intended access
path. It has not been applied to the live database as part of this audit.

## Telegram Mini App testing

Telegram requires a publicly reachable HTTPS URL; it cannot open localhost.
No HTTPS development tunnel is installed in this workspace. When one is
available, forward it to frontend port `5173`, set `APP_ORIGIN` to the exact
HTTPS origin in `.env`, and restart the app. Vite permits only the configured
origin hostname and forwards `/api` to the local loopback API. Do not tunnel
the API port.

In BotFather, select the bot and configure its Mini App/Main App URL and chat
menu button URL to that exact HTTPS frontend origin. Use the bot's menu button
or configured Mini App link to launch it. This backend does not need a Telegram
webhook or polling loop: it validates signed Mini App `initData` on API
requests and does not process bot updates.

Open the Mini App from the configured bot's menu or direct Mini App link.
Telegram then supplies signed launch `initData`; the backend verifies it with
`TELEGRAM_BOT_TOKEN`. A bot token alone cannot produce a valid user session.
Never use `initDataUnsafe` as server authentication. Real Telegram sign-in
cannot be confirmed from a normal browser preview.

## Implemented and intentionally unavailable

The UI includes Home, Tasks, Referrals, Rewards, and Profile. Backend foundations
include signed Telegram identity validation, PostgreSQL account/ledger schema,
account and rewards reads, referrals attributed from signed start parameters,
and an idempotent UTC check-in endpoint. Point balances are calculated from
`point_ledger`; the authenticated `/api/v1/me/points` endpoint returns only the
verified account's paginated immutable ledger history. The shared points service
requires an existing account, serializes transactions on that account row,
rejects conflicting idempotency-key reuse and negative balances, and is used by
the check-in transaction. Task claims and referrals currently do not award
points. Social task clicks are not verification; ad callbacks, wallet
connection, real settlement, and withdrawals are not configured. Financial
balances are not fabricated.

The public configuration endpoint exposes only validated HTTPS social/task links.
The footer renders configured public links and omits destinations that are not
configured. A signed-in user may record a social-task claim as
`pending_verification`; opening a link or recording a claim does not award
points. No provider verification or admin review flow is configured, so claims
remain pending until that workflow is implemented.

## Interface assets

The Mini App uses the supplied ABASSI logo unchanged and the existing silver
Three.js concept coin. The coin scene is loaded on demand, uses a low-power
renderer, pauses when it is off-screen or the page is hidden, and respects
reduced-motion preferences. The monochrome black page background has subtle
CSS-only floating ABASSI medallions and respects reduced-motion preferences.
Navigation is a detached, safe-area-aware black glass bar. The interface uses
the Manrope variable font from the Google Fonts repository at
`google/fonts/ofl/manrope`, under the SIL Open Font License; its license is in
`public/fonts/OFL.txt`.

The BTC, ETH, TRX, USDT, and SOL SVG icons in `public/crypto-icons/` are pinned
from `spothq/cryptocurrency-icons` at revision
`1a63530be6e374711a8554f31b17e4cb92c25fa5`. That repository is CC0 1.0 and
requests that users do not claim its icons as their own; the license and
attribution are recorded alongside the assets. Its latest commit is dated
August 2022, so the SVG files are bundled locally at the inspected revision.
The repository has no TON asset at this revision, so TON displays the neutral
unsupported-asset fallback. Icons appear only beside server-recorded
withdrawal history; no crypto asset is shown as supported by ABASSI. The API
currently reports no supported payout assets.

Run `npm.cmd run build` for a production frontend build. There is no lint script
configured in this project.
