# ABASSI production-readiness handover

Audit date: 2026-11-01
Project: ABASSI Telegram Mini App
Branch: `main`

## Executive decision

**Overall: NOT READY for production.** The local frontend builds and the API
contains a number of sound security and accounting foundations, but this audit
could not securely connect to the configured Supabase database or validate its
actual schema, grants, RLS policies, migration history, backups, or recovery
readiness. Telegram was not exercised in a real Mini App session. Reward
verification, referral qualification, AdsGram, wallet connection, withdrawals,
administration, and deployment operations are incomplete or deliberately
disabled.

No production migration, deployment, payout, wallet transaction, or live
Telegram API request was performed during this audit. No production data was
changed.

## Evidence and verification boundaries

- **Local source:** reviewed frontend, backend, tests, configuration and SQL
  migrations in this repository.
- **Local checks:** TypeScript check, all unit/API tests, production build,
  dependency audit, environment-template validation, and frontend HTTP/browser
  smoke checks passed as recorded below.
- **Actual Supabase:** not verified. The local configuration points to a
  Supabase PostgreSQL pooler and enables TLS verification, but the configured
  CA certificate file is absent. A read-only connection attempt failed during
  TLS certificate validation (`SELF_SIGNED_CERT_IN_CHAIN`) before schema
  queries could run. The API also fails to start with that configured missing
  CA file.
- **Prior local preview process:** an API development process from the previous
  preview session was found running with `DATABASE_SSL=false`; it was stopped
  at the beginning of this audit. Earlier health/readiness requests through
  that process were read-only checks, but they are not accepted as secure
  database verification. No migration or write operation was issued. Do not
  retain or repeat the TLS-verification bypass.
- **Historical evidence:** an earlier workspace checkpoint records applying
  migrations `001` and `002` and verifying readiness at that time. This audit
  could not independently confirm the current live database state, so that
  history is not treated as current production verification.
- **External services:** no BotFather, Telegram launch, AdsGram, TON, or payout
  integration was contacted or tested with credentials.

## Architecture

- **Frontend:** React 19, TypeScript, Vite 8, React Router 7, and
  `@tma.js/sdk-react`. It has Home, Tasks, Referrals, Rewards, and Profile
  routes, a shared account/config context, and preview mode when verified
  Telegram launch data is absent.
- **Backend:** Fastify 5 API with Zod environment validation, CORS restricted to
  `APP_ORIGIN`, rate limiting, redaction of authorization/cookie headers, and
  PostgreSQL access through `pg`.
- **Authentication:** API routes use Telegram-signed `initData`; the server
  verifies the HMAC using the BotFather token and applies timestamp freshness
  checks. The browser does not authenticate using `initDataUnsafe`.
- **Database:** PostgreSQL migrations are under `server/migrations/`. The
  migration runner tracks migration filenames, takes an advisory lock, applies
  each migration transactionally, and has preflight checks. It was not run
  against the live database in this audit.
- **Deployment:** no checked-in deployment manifests, CI workflow, hosting
  configuration, or operational backup/recovery runbook was found. The
  development servers bind to loopback; Telegram requires a public HTTPS
  Mini App URL.

## Feature inventory

| Feature | Status | Evidence / limitation |
|---|---|---|
| Home, Tasks, Referrals, Rewards, Profile screens | Implemented and locally verified | Routes and shared shell exist; this is UI verification, not production-service verification. |
| Telegram Mini App initialization and viewport support | Implemented, not verified in Telegram | SDK initialization and safe-area handling exist; no real Telegram WebView launch was performed. |
| Telegram signed `initData` verification | Implemented and unit-tested | HMAC validation, timing-safe hash comparison, duplicate-field rejection, timestamp expiry/future checks, and identity validation are covered by tests. |
| Authentication replay/session revocation | Partially implemented | `auth_date` bounds the replay window, but the same valid `initData` can be replayed until expiry. There is no one-time exchange/session registry or revocation mechanism. |
| Account creation and returning-user API flow | Implemented in source, not live-verified | Account routes are scoped to the verified Telegram identity; database-backed behavior could not be exercised against Supabase. |
| Dashboard/account information | Implemented, not live-verified | Uses authenticated API data and an explicit preview state; no fabricated points balance is displayed. |
| Points ledger and history | Implemented in source and locally tested | Balances are ledger-derived; the points service locks the user row, checks idempotency-key consistency, and rejects negative balances. Live schema and data remain unverified. |
| Daily check-in/streak | Implemented but disabled by default | UTC date, uniqueness, transaction and idempotency controls exist. `DAILY_CHECKIN_ENABLED` is false. The default 50-point amount is not an approved reward policy. |
| Referrals and attribution | Partially implemented | Signed Telegram start parameters record attribution. Qualification, referral reward issuance, and a moderation/admin path are absent. Tier thresholds have an unresolved gap/overlap. |
| Social tasks | Partially implemented | A claim can be recorded as `pending_verification`; the API does not award points. No provider verification or admin review flow is implemented. |
| AdsGram/rewarded advertising | Not implemented | No SDK completion flow or verified server postback exists; feature is disabled and configuration is absent. |
| TON wallet connection | Not implemented | No TON Connect integration, transaction construction, address validation, or wallet connect/disconnect flow. |
| Solana/token support | Not implemented / unresolved product decision | Original product direction references Solana, while later configuration mentions TON. The supported chain must be explicitly selected before implementation. |
| Transaction verification and payouts | Not implemented | No on-chain transaction verifier or payout processor exists. Payout, revenue-share, and share-reward flags are hard-disabled. |
| Withdrawals | Partially implemented | Read-only withdrawal history and domain validation helpers exist; no request submission, approval, signing, or transfer execution exists. |
| Admin dashboard/user management | Not implemented | An audit-events table exists in the local schema, but there is no admin UI, authorization model, moderation queue, or management API. |
| External social integrations | Blocked / not implemented | Environment slots and UI destinations do not prove provider verification. URLs must be owner-approved; they are not configured/verified here. |
| Production hosting and monitoring | Not implemented / blocked | No deployment pipeline, production URL, uptime monitoring, alerting, or operational service configuration was found. |
| Backups and recovery | Blocked | No backup schedule, retention, restore procedure, or restore rehearsal is documented in the repository. |

## Security and data findings

### Telegram and API

- Fabricated client-supplied user IDs are not accepted as authentication; protected
  routes derive identity from validated signed `initData`.
- HMAC, expiry, malformed/duplicate field, and authorization ownership tests
  are present and passed locally.
- **Replay remains a gap:** signed launch data can be replayed within the
  configured validity interval. A one-time exchange to a short-lived,
  revocable server session is a separate authentication design requiring
  implementation and testing. Do not treat timestamp validation alone as
  replay prevention.
- The code has no BotFather bot-update webhook/polling service. This is not
  required for the implemented signed Mini App API flow, but bot identity,
  BotFather launch configuration, and actual Telegram authentication remain
  unverified.
- The local environment reports Telegram token and username fields as set, but
  their validity was not checked. Repository documentation warns that a bot
  token was previously present in an example file; **treat it as compromised
  unless BotFather rotation has already been completed**. Do not reuse an
  exposed token.

### Supabase/database

- Local migrations define users, points ledger, check-ins, task claims,
  referrals, provider reward events, reward cycles/allocations, withdrawal
  records, and admin audit events, with indexes, constraints and ledger
  mutation guards.
- The local migrations `001` and `002` do **not** enable RLS or define Supabase
  policies. Thus the local schema alone does not establish that Supabase Data
  API roles cannot access these tables.
- This audit could not inspect live RLS, grants, policies, table ownership,
  migration history, indexes, functions, or records because strict TLS failed
  before a read-only query could execute.
- Migration `003_enable_public_rls.sql` was added. It enables RLS on the
  application and migration tables and creates no client policies, so
  non-owner API roles default-deny. It is **not applied**. The intended backend
  and migration role must be verified to be the trusted table owner (which
  bypasses RLS unless `FORCE ROW LEVEL SECURITY` is enabled); do not add
  client-facing policies without an approved access model.
- The API readiness endpoint checks selected tables and indexes; it does not
  attest RLS, grants, policies, migration history, or backup status. A
  readiness success alone is not a security review.
- The `.env` configuration names a CA file that is currently missing. Restore
  the project CA from the official Supabase dashboard through a secure local
  process, verify the configured path exists, and keep certificate validation
  enabled. The database URI and CA file must never be committed.
- No migration or database write was executed in this audit.

### Ledger, rewards and fraud prevention

- The point balance is derived from ledger entries. The service uses a
  per-account lock, idempotency keys and nonnegative balance validation.
- Daily check-in has one UTC record per account/day and one corresponding
  ledger idempotency key. It is disabled until the reward policy is approved.
- Task claims remain pending and do not award points. Referral attribution is
  not referral qualification. No ad completion earns points.
- There is no confirmed points-to-token/money conversion, approved weekly pool,
  or settlement calculation rule. Do not represent proposed UI amounts or rank
  thresholds as payable rewards.
- Ledger mutation guards exist in the local migration history. Actual live
  triggers and RLS still require database inspection.

## Database migrations and live validation

Local migration files:

1. `001_core.sql` — application tables, constraints, indexes, and append-only
   ledger guards.
2. `002_prevent_ledger_truncate.sql` — protects selected append-only tables
   against truncation.
3. `003_enable_public_rls.sql` — added in this audit; enables RLS without
   client policies. **Not run against Supabase.**

The migration runner uses an advisory lock and per-migration transaction. The
local migration test verifies that migration `003` covers the enumerated tables
and contains no destructive data statements. This is static/unit evidence, not
proof that the live database has the expected schema or that migration `003`
will apply cleanly to it.

Before any production migration:

1. Restore and validate the official CA file and database credentials.
2. Use a read-only preflight to confirm the Supabase project, current schema,
   migration history, owners, grants, RLS and policies.
3. Compare the live state with all three local migrations.
4. Confirm a recent, restorable backup and an approved maintenance/recovery plan.
5. Apply only after review and explicit owner authorization; then recheck
   migration history, RLS, grants and application readiness.

## Environment variables

`.env.example` is placeholder-only. Copy it to the ignored local `.env`; do not
commit `.env`, `.env.*`, CA files, private keys, provider secrets, or database
dumps.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Runtime environment (`development`, `test`, or `production`). |
| `API_PORT` | Fastify API listen port. |
| `APP_ORIGIN` | Exact allowed frontend origin for CORS. Production must use the approved HTTPS origin. |
| `DATABASE_URL` | Server-only PostgreSQL connection URI for the intended Supabase project. |
| `DATABASE_SSL` | Keep `true`; TLS certificate verification must not be bypassed. |
| `DATABASE_CA_CERT_PATH` | Local path to the appropriate trusted CA certificate when required by the Supabase connection. |
| `TELEGRAM_BOT_TOKEN` | Rotated BotFather token, backend only; never expose or commit it. |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@`. |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | Maximum age for signed Telegram launch data. |
| `DAILY_CHECKIN_ENABLED` | Must remain false until the reward policy and deployment are approved. |
| `DAILY_CHECKIN_POINTS` | Proposed/configured check-in amount; not an approved promise. |
| `TASK_URL_*`, `PUBLIC_URL_*` | Owner-approved HTTPS task and public social destinations. |
| `ADSGRAM_ENABLED`, `ADSGRAM_BLOCK_ID`, `ADSGRAM_SERVER_POSTBACK_SECRET` | Ads provider settings; currently no implementation, keep disabled. |
| `WALLET_CHAIN`, `WALLET_NETWORK` | Unresolved wallet configuration; do not enable until chain/network are approved and implemented. |
| `PAYOUTS_ENABLED`, `REVENUE_SHARE_ENABLED`, `SHARE_REWARD_ENABLED` | Financial toggles; keep false until end-to-end processing, controls and policy are approved. |

## Owner setup and decisions required

### Required before production

1. **Rotate the Telegram bot token** in BotFather if the historical exposed token
   has not already been revoked. Store only the replacement in the ignored
   server `.env`.
2. **Restore the correct Supabase CA file** locally, fix the CA path, and
   confirm strict-TLS read-only connectivity. Verify the database URI refers to
   the intended project without sharing it in logs or reports.
3. **Inspect the live Supabase database read-only:** applied migration files,
   all public tables, constraints/indexes/triggers/functions, grants, owners,
   RLS flags/policies, and Data API exposure. Confirm no unexpected access.
4. Review and explicitly authorize migration `003` after the live preflight and
   backup check. Do not run it blindly.
5. Choose the supported chain (the product brief mentions Solana; current
   wallet settings mention TON) and define whether any token or financial
   feature is in scope.
6. Approve written business rules before enabling rewards: check-in amount and
   schedule; task verification and values; referral qualification, tiers and
   rewards; weekly pool rules; conversion/eligibility; withdrawal minimums,
   limits, fees and review process. Current code intentionally does not invent
   these.
7. Decide how authentication replay is mitigated (for example, a short-lived
   server session exchanged once from Telegram `initData`), then implement and
   security-test that design.
8. Configure a production HTTPS host and exact `APP_ORIGIN`; configure the
   Mini App/Main App and menu-button URL in BotFather. Verify real launch,
   account creation, returning-user flow, expiry, invalid signature and account
   ownership in Telegram.
9. Establish backups/PITR, retention, restore drills, monitoring/alerts, an
   incident owner and deployment/rollback procedures.

### Required before optional integrations

- **Social tasks:** configure approved destination URLs and implement provider
  verification or a reviewed admin moderation process before awarding any
  points.
- **AdsGram:** obtain provider approval and a real block ID; implement the
  supported SDK completion flow and server-side postback/signature verification,
  idempotency, expiry and replay protection; test without granting on client
  callbacks alone.
- **Admin:** define administrator identity/roles, secure authorization,
  moderation/audit permissions, and implement/test the admin interface/API.
- **TON or Solana:** implement the chosen wallet connector, address/network
  checks, transaction construction and server-side chain verification.
- **Withdrawals/payouts:** approve settlement rules and compliance controls,
  implement idempotent review and signing/transfer processing, and test against
  a non-production network first. No live transaction was performed.

## Operations and troubleshooting

- Local development commands: `npm.cmd run dev`, `npm.cmd run typecheck`,
  `npm.cmd test`, `npm.cmd run build`.
- Local frontend/API bind to loopback. Vite proxies `/api` to the backend.
- `GET /api/v1/health` reports service/configuration presence, not provider or
  database security readiness.
- `GET /api/v1/ready` checks selected database objects; it does not prove RLS
  or migration integrity.
- With the current local CA-path problem, the API can fail before listening.
  Correct the CA path instead of disabling TLS. A previous local preview
  process used a TLS-disabled override; it was stopped and must not be used as
  the production connection pattern. With missing credentials, retain preview
  mode and do not use test or fabricated Telegram identity data as proof of
  authentication.
- No production monitoring, alert routing, or backup restore procedure was
  verified.

## Verification completed in this audit

- `npm.cmd run typecheck` — passed.
- `npm.cmd test` — 7 test files, 52 tests passed.
- `npm.cmd run build` — passed. Vite reports the existing Three.js chunk is
  over 500 kB minified; this is a performance warning, not a build failure.
- `npm.cmd audit` — 0 reported vulnerabilities.
- A common-format secret scan found only synthetic-looking token/database URI
  fixtures in server tests; the matched values were inspected redacted. No
  `.env`, credential, private-key, certificate, or database-dump file is staged.
- `.env.example` parsed and passed the project Zod configuration schema with
  database, check-in, AdsGram, payouts, and wallet safely disabled/unconfigured.
- Frontend root returned HTTP 200 and rendered the Home page in Preview mode in
  the local browser.
- API smoke against the configured environment was **blocked** by the missing
  CA file. No database/API readiness success is claimed for this audit.
- Migration `003` static safety test passed as part of the test suite. No live
  migration was executed.
- No real Telegram, AdsGram, wallet, payout, or Supabase production workflow
  was tested.

## Git and release posture

The audit changes must be reviewed, committed, and pushed separately after
checking the complete diff and secret exclusions. Do not deploy from this
handover. Production remains **NOT READY** until the required owner actions and
live-service verification above are complete.
