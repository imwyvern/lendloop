# LendLoop

**Borrow what you need. Lend what you don't.**

A neighborhood tool library built with Next.js 15 App Router, React 19, Clerk, Convex, Tailwind CSS 4, and self-hosted n8n. Visitors see only available tool names and categories. Members can manage listings, request dates, review incoming requests, cancel pending requests, and mark approved loans returned. Admins moderate listings, inspect all loans, and mark trusted lenders.

The implementation follows [DESIGN.md](docs/DESIGN.md) and [SPEC_SOURCE.md](docs/SPEC_SOURCE.md). Notifications are deliberately logged mocks; no email or messaging service is connected.

## Screenshots

Screenshot placeholders: public landing and available tools; member tool catalog and borrowing form; incoming requests with automation activity; admin moderation. Capture these after connecting a development Clerk app and Convex deployment. The repository contains no fabricated accounts or seeded personal data.

## Quick start

Use Node.js 20.9 or newer, npm, and Docker Compose v2. Node.js 24 is used for the dependency-free integration checks. Only the packages allowed by the brief are direct dependencies; `package-lock.json` pins the resolved tree.

```sh
npm ci
cp .env.example .env.local
```

Replace the three Next.js placeholders in `.env.local` with your own development values. Never commit this file. With no configuration, the app builds and renders an explicit setup state; it does not impersonate a signed-in user or display fabricated Convex results. Rebuild after changing `NEXT_PUBLIC_*` values because Next.js embeds them in the browser bundle.

### 1. Clerk

Create a Clerk application and enable email sign-in with email verification. In its dashboard, create the **Convex JWT template**, named exactly `convex`, with audience `convex`, the default Clerk signing key, and claims for `email`, `email_verified`, and `name`. Copy the issuer / Frontend API URL into the Convex `CLERK_JWT_ISSUER_DOMAIN` environment variable. Copy the publishable and secret keys into `.env.local`.

The template claims can use these Clerk shortcodes (verification stays a boolean in the issued token):

```json
{
  "aud": "convex",
  "email": "{{user.primary_email_address}}",
  "email_verified": "{{user.email_verified}}",
  "name": "{{user.full_name}}"
}
```

Current Clerk dashboards may also offer a Convex integration that supplies the audience automatically. This project supports the `convex` JWT template flow requested by the design. Follow the official [Convex and Clerk setup guide](https://docs.convex.dev/auth/clerk) and [Clerk JWT template documentation](https://clerk.com/docs/guides/sessions/jwt-templates) for dashboard details.

### 2. Convex

```sh
npx convex dev
```

Sign in and select a new development project. The command writes your deployment selection and public URL to `.env.local`, pushes the schema/functions, replaces the checked-in typed bootstrap files in `convex/_generated`, and watches for changes. No deployment or keys are included in this repository. If the initial push reports a missing issuer, set it in the Convex dashboard and rerun the command.

Set these **on the Convex deployment**, using the dashboard or `npx convex env set VARIABLE_NAME` and its prompted input: `CLERK_JWT_ISSUER_DOMAIN`, `ADMIN_EMAILS`, `N8N_NOTIFY_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, and `CONVEX_INBOUND_SECRET`. Avoid putting real secret values in shell history. Generate two independent random HMAC secrets, for example with `openssl rand -hex 32`, and store them securely.

Use the Clerk issuer URL, a comma-separated list of verified admin emails you control, the n8n **production** webhook URL, and the two secrets. The notification webhook must be reachable from Convex's cloud runtime; `localhost` on your laptop is not reachable from Convex. Use an HTTPS tunnel or a hosted development n8n instance. `.convex.cloud` is the client URL; `.convex.site` is the HTTP action URL.

The first authenticated visit calls `users.ensure`. New users whose verified identity email appears in `ADMIN_EMAILS` receive the admin role. Existing roles are preserved on later ensures; changing the allowlist does not promote/demote existing records. Adjust an existing role deliberately in the Convex dashboard. Users cannot submit a role, trusted flag, or another user's identity to this mutation.

### 3. Next.js

```sh
npm run dev
```

Open `http://localhost:3000`. Use separate browser profiles for a lender and borrower. Sign in before creating a listing. The header links to all tools, My listings, My requests, and Incoming requests; the admin link appears only for an admin. Convex enforces the same permissions independently of the UI.

### 4. n8n

Create `n8n/.env` with `N8N_WEBHOOK_SECRET`, `CONVEX_INBOUND_SECRET`, `CONVEX_SITE_URL`, and `N8N_ENCRYPTION_KEY`, copying the placeholders from `.env.example` and replacing them locally. Both HMAC secrets must match their corresponding Convex variables. Keep the encryption key persistent across restarts.

```sh
docker compose --env-file n8n/.env -f n8n/docker-compose.yml up -d
```

Open `http://localhost:5678`, create the local n8n owner account, then import the three exports from `n8n/workflows/`:

1. `error-handler.json` first.
2. `request-notification.json`.
3. `overdue-reminders.json`.

In the notification and overdue workflows' settings, select the imported **LendLoop — Error handler** as the error workflow and save. Importers can replace workflow IDs; verify this selection even though the exports include an error-workflow reference. Publish/activate both main workflows. The error-trigger workflow runs when selected by another workflow. Copy the notification production webhook URL (path `/webhook/lendloop-notify`) to `N8N_NOTIFY_WEBHOOK_URL` in Convex. The test webhook URL only works while the n8n editor is listening.

The schedule runs daily at 09:00 in the workflow timezone (UTC by default). Compose uses a persistent named volume and binds the editor to localhost. Code nodes explicitly allow only Node's built-in `crypto` module and environment access. These settings are necessary for the signed integration; restrict workflow editing to trusted operators. Check the [n8n security environment settings](https://docs.n8n.io/hosting/configuration/environment-variables/security/) when hardening a deployment.

## Environment variables

| Variable | Runtime | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Next.js | Convex client URL ending in `.convex.cloud`; public |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Next.js | Clerk browser key; public |
| `CLERK_SECRET_KEY` | Next.js server | Clerk server authentication; secret |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex | Exact trusted Clerk JWT issuer |
| `ADMIN_EMAILS` | Convex | Comma-separated verified email allowlist for first-user bootstrap |
| `N8N_NOTIFY_WEBHOOK_URL` | Convex | Reachable production notification webhook |
| `N8N_WEBHOOK_SECRET` | Convex + n8n | Convex → n8n signing key |
| `CONVEX_INBOUND_SECRET` | Convex + n8n + local test shell | n8n → Convex signing key |
| `CONVEX_SITE_URL` | n8n + local test shell | Convex HTTP URL ending in `.convex.site` |
| `N8N_ENCRYPTION_KEY` | n8n | Persistent credential encryption key |
| `N8N_PUBLIC_URL` | n8n (optional) | Externally reachable base URL, including trailing slash; Compose defaults to localhost |

`.env.example` contains placeholders only. Root `.env.local` is for Next.js/Convex CLI configuration, Convex deployment variables are configured separately, and `n8n/.env` is for Compose. A value in one runtime does not configure the others. `.gitignore` ignores every `.env*` except `.env.example`, build output, node modules, and local logs.

## Architecture and files

```text
Browser
  │ Clerk session → signed Convex JWT
  ▼
Next.js App Router + ClerkProvider + ConvexProviderWithClerk
  │ realtime queries / authenticated mutations
  ▼
Convex ── schema, identity checks, RBAC, date/overlap validation
  │ committed status change → scheduled internal action
  │ HMAC (N8N_WEBHOOK_SECRET)
  ▼
n8n notification webhook → verify → mock send → response

n8n daily 09:00 schedule
  │ HMAC (CONVEX_INBOUND_SECRET)
  ▼
Convex POST /n8n/overdue → overdue loans + daily keys
  │ n8n skips alreadyReminded, mocks each reminder
  ▼
Convex POST /n8n/events → idempotent event record → live activity badge

n8n workflow failures → Error Trigger → formatted mock alert
```

`app/` contains every route listed in the design. `components/` contains the providers, navigation, tool cards, loan rows, activity badge, filters, and shared forms/states. `lib/categories.ts` defines shared enums. `convex/` contains the schema, auth helpers, tools/loans/admin APIs, HMAC verification, internal automation, and HTTP routes. `n8n/` contains Compose and the three workflow exports; there is no Convex cron. `scripts/sign-test.mjs` signs exact request bytes for curl. `tests/` holds dependency-free security/integration checks.

The checked-in `_generated` files derive their types from the actual schema and function modules and use Convex's conventional runtime builders. They support offline type checking; `npx convex dev`/codegen will replace them for a configured deployment. `convex.json` selects TypeScript generated files so regeneration uses the same filenames. They do not emulate a database or bypass authentication.

## RBAC

| Operation | Visitor | Member | Admin |
| --- | --- | --- | --- |
| Available public tool name/category | Yes | Yes | Yes |
| Full tool catalog, availability, owner display name/trust | No | Yes | Yes |
| Create a listing | No | As self | As self |
| Edit a listing | No | Own only | Own only |
| Remove a listing | No | Own only | Any |
| Request a tool | No | Other owners' tools | Other owners' tools |
| Approve/decline pending requests | No | Tool owner only | Tool owner only |
| Cancel pending request | No | Borrower only | Borrower only |
| Mark approved loan returned | No | Owner or borrower | Owner or borrower |
| Read personal/incoming loans | No | Own involvement only | Own involvement only |
| View all loans / set lender trust | No | No | Yes |
| Call automation functions directly | No | No | No; internal only |

Admins do not receive extra borrowing powers. All public mutations derive the acting user from a verified Clerk identity. Internal automation functions are accessible only from other backend functions or HMAC-verified HTTP actions. UI route guards are convenience checks, not the authorization boundary.

## Security and data minimization

- Public queries return exactly `_id`, `name`, and `category`, and exclude tools on loan today. Authenticated catalog queries include availability and lender display name/trust, never lender email.
- Borrowing dates are real ISO calendar dates, inclusive, start no earlier than today, ordered, and at most 30 days. Approval atomically checks all other approved loans for inclusive overlap. A current approved overlap means “on loan”; future reservations do not make a tool unavailable today.
- Listing strings are trimmed, length-limited, and validated against shared category/condition enums on the server. The UI also presents validation and inline errors.
- Notification payloads include only event/loan identifiers, status/type, tool name, dates, and the one recipient's name/email. Requests notify the owner; decisions notify the borrower; cancellations notify the owner; returns notify the other participant. No counterparty email is sent. Overdue payloads include only fields required to remind the borrower plus the daily key/check.
- Both directions sign **the exact raw body bytes** with HMAC-SHA256 over `timestamp + '.' + rawBody`. Receivers require `X-LendLoop-Timestamp` (Unix seconds), `X-LendLoop-Signature: sha256=<64 hex characters>`, a timestamp within ±300 seconds, and a constant-time signature comparison. The body must not be reformatted between signing and sending. Missing secrets fail closed. HTTPS is required outside local development.
- The two directions use separate secrets. HMAC authenticates a shared-key caller; it does not encrypt payloads. Keep clocks synchronized. The timestamp narrows replay exposure; event keys make writebacks idempotent, but this is not a general nonce replay database.
- No production secret, real account, personal name, or external provider credential is stored in the repository. n8n mock output and execution history can still contain recipient data at runtime; control access and retention.

## Reliability and idempotency

Every loan creation/status transition schedules notification work only after the mutation commits. Convex notification delivery makes three attempts with backoff, uses a stable event ID, and records a `sent` or `failed` automation event keyed `notify:<eventId>`. Notification failure does not roll back the user's loan action. Inspect Convex action logs and the activity badge for failures; a dead-letter retry queue is a production follow-up.

The notification workflow also keeps a ten-minute, best-effort event-ID replay cache in n8n workflow static data. Static data persists only after a successful published execution. Compose limits automatic production executions to one at a time for this demo; manual runs and external delivery still need provider idempotency.

The overdue query selects approved loans with `endDate < today`, checks events with key `<loanId>:<yyyy-mm-dd>`, and returns `alreadyReminded`. The workflow skips completed keys. Both Convex HTTP request nodes retry failed requests up to three attempts. Event insertion checks the indexed key in a Convex transaction and returns `{duplicate:true}` for a repeated write. The workflow posts the exact same signed body on writeback retries.

These guarantees prevent duplicate **event records** and reminders on completed, sequential reruns. A crash after an external send but before its writeback, concurrent workflow executions, or a lost successful webhook response can still duplicate delivery. The mock sender is not an exactly-once delivery service. A real provider must accept `eventId`/`reminderKey` as its idempotency key, or use a durable outbox/claim-and-deliver mechanism; do not assume an after-send writeback alone can guarantee exactly-once effects.

The two main workflows point to the error workflow, which formats the workflow, failed node, execution URL, and error message for a mock alert. The workflow's error path is visible in n8n execution history. An intentionally rejected webhook returns 401; workflow configuration/runtime failures trigger the error workflow. Keep Convex and n8n failure monitoring in production because some failures occur before an n8n execution exists.

## Testing the integration

```sh
npx tsc --noEmit
npm run lint
npm test
npx next build
```

The build requires no real keys. Authenticated behavior, Convex deployment, Docker runtime import, and live webhook delivery require your configured development services. The local checks exercise the signing contract, tampering/time-window rejection, workflow graph/export structure, and other security boundaries without contacting third parties.

For signed curl calls, set `CONVEX_SITE_URL` and `CONVEX_INBOUND_SECRET` in your local shell without committing them. Use the helper below; it emits curl arguments and headers, never the signing secret. Send exactly the same file bytes that were signed.

```sh
# Prints a signed curl command; inspect and run it before the timestamp expires.
node scripts/sign-test.mjs \
  --url "$CONVEX_SITE_URL/n8n/overdue" \
  --secret-env CONVEX_INBOUND_SECRET --body '{}'

# Or send immediately using Node fetch and show the HTTP status/body.
node scripts/sign-test.mjs \
  --url "$CONVEX_SITE_URL/n8n/overdue" \
  --secret-env CONVEX_INBOUND_SECRET --body '{}' --send

# Writeback: substitute an actual development loan ID and its daily reminder key.
node scripts/sign-test.mjs \
  --url "$CONVEX_SITE_URL/n8n/events" \
  --secret-env CONVEX_INBOUND_SECRET \
  --body-file /tmp/lendloop-event.json --send

# Convex → n8n direction, with a minimal payload from a development loan.
node scripts/sign-test.mjs \
  --url http://localhost:5678/webhook/lendloop-notify \
  --secret-env N8N_WEBHOOK_SECRET \
  --body-file /tmp/lendloop-notification.json --send
```

An event file has this shape (replace placeholders with IDs/dates from the overdue response):

```json
{"loanId":"your-loan-id","kind":"overdue_reminder","status":"sent","idempotencyKey":"your-loan-id:yyyy-mm-dd","detail":"Mock reminder sent"}
```

A notification test file has this shape:

```json
{"eventId":"your-loan-id:requested:timestamp","type":"requested","loanId":"your-loan-id","status":"requested","toolName":"Tool name","recipientName":"Recipient","recipientEmail":"recipient@example.invalid","startDate":"yyyy-mm-dd","endDate":"yyyy-mm-dd"}
```

`--body-file -` reads stdin; trailing newlines are preserved. `--timestamp 1` creates a deliberately stale request for a 401 test. Default output safely shell-quotes its curl arguments; the secret is read only from the named environment variable and never emitted. To test a mismatched signature, change one body character in the printed curl command without changing its headers. Do not use production recipient addresses in test files.

After importing/publishing workflows, verify this functional path:

1. A lender creates a tool. Signed-out visitors see its name/category only.
2. A borrower requests valid dates. The owner sees the incoming request and n8n logs one minimal mock notification.
3. The owner approves. The borrower sees the status and notification activity. Approving an overlapping second loan is rejected.
4. Try editing/removing another member's tool, deciding someone else's request, and calling an admin function as a member: Convex must reject each.
5. The borrower can cancel only a pending request. Either participant can mark an approved loan returned.
6. For reminder testing, use a disposable development loan, approve it normally, then deliberately set its dates to yesterday in the Convex dashboard. Fetch `/n8n/overdue`, run the overdue workflow manually, and run it again. There should be one sent daily event; the second run skips the loan.
7. Corrupt the signature or use a timestamp older than 300 seconds: expect 401. Post a valid event twice: expect the second response to indicate `duplicate:true`. Temporarily break a development endpoint to inspect retries and the error workflow; restore it afterward.

Do not alter production data to test reminders. UTC dates are used consistently by this implementation. The UI shows the latest event per loan (including “Reminder sent 2 days ago”); the complete history is retained in `automationEvents`.

## Production changes

- Use Clerk webhooks with verified signatures to synchronize profile/email changes and account deletion, rather than relying only on sign-in upserts.
- Put secrets in a manager such as AWS Secrets Manager, rotate both HMAC keys independently, and implement a short dual-secret verification window during rotation.
- Run n8n with managed Postgres, queue mode/workers, backups, TLS, and SSO or an authenticated reverse proxy. Persist and back up its encryption key. Pin and verify the image digest. Restrict editor access and allowed Code modules. Set a deliberate execution/log retention policy.
- Replace mocks with an email provider and accessible templates. Apply provider idempotency keys and a durable outbox/dead-letter queue, with retry and operator redrive for failed notifications.
- Add mutation/HTTP rate limiting and abuse controls, bounded/paginated queries, retention rules, and a dedicated admin-action audit table.
- Add Sentry/Datadog or equivalent monitoring for failed actions, n8n error executions, retry exhaustion, HTTP rejection rates, and delivery latency. Redact contact data in operational logs.
- Add CI for type checking, lint, security/integration tests, and build; run real Clerk/Convex/n8n staging end-to-end tests with isolated credentials.
- Choose neighborhood timezones explicitly and make date/09:00 scheduling semantics timezone-aware. Add stronger reservation/availability UX if required by the product.

No git commit, deployment, account creation, or real notification send is performed by this implementation.

## Verification status
- `npm run typecheck`, `npm test` (18 HMAC/date/security unit tests) and `npm run build` pass locally without keys (Clerk middleware falls back to a setup mode when keys are absent).
- `convex/_generated/*` are hand-written typed stand-ins so the repo type-checks before a deployment exists; `npx convex dev` regenerates them.
- End-to-end runs against a live Clerk app, Convex deployment and n8n instance require your own keys (see Environment variables).
