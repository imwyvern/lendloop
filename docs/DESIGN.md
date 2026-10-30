# LendLoop — Product & Technical Design

> Authored directly (doc-generation agent was usage-limited at time of writing).

## 1. Product
Neighborhood tool-lending board. Public visitors see available tools (name + category only). Signed-in users list tools, request date ranges, approve/decline, mark returned. Admins moderate. n8n sends notifications and daily overdue reminders.

## 2. Stack (official packages only)
next@15 (App Router), react@19, typescript, tailwindcss@4, @clerk/nextjs, convex (incl. convex/react-clerk). No other runtime deps. n8n via official `docker.n8n.io/n8nio/n8n` image.

## 3. Layout
```
app/
  layout.tsx            ClerkProvider + ConvexClientProvider, header
  page.tsx              public landing + public tool list
  tools/page.tsx        all tools w/ availability + category filter, borrow form
  tools/new/page.tsx    create listing
  tools/[id]/edit/page.tsx
  me/listings/page.tsx  My listings
  me/requests/page.tsx  My requests (as borrower)
  me/incoming/page.tsx  Incoming requests (as owner)
  admin/page.tsx        all loans, remove listings, trust lenders
components/             ConvexClientProvider, Nav, ToolCard, LoanRow, ActivityBadge, CategoryFilter
lib/categories.ts       shared category + condition enums
middleware.ts           clerkMiddleware; protect /tools/new, /me, /admin
convex/
  schema.ts auth.config.ts
  lib/auth.ts           requireUser, requireAdmin, getViewer
  lib/hmac.ts           sign/verify (Web Crypto, constant-time compare)
  users.ts tools.ts loans.ts automation.ts admin.ts http.ts crons? (no: scheduling is n8n's job)
n8n/
  docker-compose.yml
  workflows/request-notification.json overdue-reminders.json error-handler.json
.env.example  README.md
```

## 4. Data model (convex/schema.ts)
- **users**: clerkId (idx), name, email, role: "user"|"admin", trusted: boolean. Upserted by `users.ensure` on first sign-in. Admin bootstrap: email listed in Convex env `ADMIN_EMAILS` gets admin on first ensure; afterwards role is only changed in DB.
- **tools**: ownerId → users, name, category, condition, description, createdAt. idx by_owner, by_category.
- **loans**: toolId, ownerId, borrowerId, startDate, endDate (ISO yyyy-mm-dd), status: requested|approved|declined|returned|cancelled, createdAt, updatedAt, returnedAt?. idx by_tool, by_borrower, by_owner, by_status.
- **automationEvents**: loanId, kind: "notification"|"overdue_reminder", status: "sent"|"failed", idempotencyKey (idx, unique by check), detail?, createdAt.

Availability: tool is "on loan" if an approved loan overlaps today; "available" otherwise. Overlapping approved loans are rejected at approve time.

## 5. Convex functions & auth rules
All mutations derive identity from `ctx.auth.getUserIdentity()`; never trust client-provided user ids.
| Function | Rule |
|---|---|
| tools.listPublic (q) | none; returns `{_id,name,category}` only |
| tools.listAll (q, category?) | signed in; returns tool + availability + owner display name + trusted flag (no email) |
| tools.mine (q) | signed in; owner = viewer |
| tools.create / update / remove (m) | signed in; update/remove require owner == viewer, or admin for remove. Validate lengths & enums |
| loans.request (m) | signed in; not own tool; start<=end, start>=today, max 30 days |
| loans.myRequests / incoming (q) | borrower == viewer / owner == viewer |
| loans.decide (m, approve|decline) | owner == viewer; status must be requested; approve checks overlap |
| loans.cancel (m) | borrower == viewer; status requested |
| loans.markReturned (m) | owner or borrower; status approved |
| admin.allLoans, admin.setTrusted, tools.remove(any) | requireAdmin |
| automation.* internal | internalQuery/internalMutation only, reached via HTTP actions after HMAC verify |

Every status change schedules `internal.automation.notify` (action) via `ctx.scheduler.runAfter(0, …)` so the mutation commits first.

## 6. Clerk ↔ Convex
Clerk JWT template named `convex`; `convex/auth.config.ts` uses `CLERK_JWT_ISSUER_DOMAIN`. Client: `ConvexProviderWithClerk` with `useAuth`.

## 7. Signing scheme (both directions)
Headers: `X-LendLoop-Timestamp` (unix seconds), `X-LendLoop-Signature: sha256=<hex>` where hex = HMAC-SHA256(secret, `${timestamp}.${rawBody}`). Receiver rejects if |now - ts| > 300 s or signature mismatch (constant-time compare). Separate secrets per direction:
- `N8N_WEBHOOK_SECRET`: Convex → n8n (n8n verifies in a Code/Crypto node, secret from n8n env/credential).
- `CONVEX_INBOUND_SECRET`: n8n → Convex HTTP endpoints (n8n signs; Convex verifies).
Notification payload (minimal): `{eventId, type, loanId, status, toolName, recipientName, recipientEmail, startDate, endDate}` – only the recipient's contact, never the counterparty's email.

## 8. Convex HTTP endpoints (convex/http.ts)
- `POST /n8n/overdue` → signed request; returns overdue loans (approved, endDate < today, not returned) with borrower name/email, tool name, endDate, and `reminderKey = loanId:yyyy-mm-dd`.
- `POST /n8n/events` → signed; body `{loanId, kind, status, idempotencyKey, detail}`; inserts automationEvents unless key exists (returns `{duplicate:true}`). Idempotent.

## 9. n8n workflows
1. **Request notification**: Webhook (POST, raw body) → Code: verify HMAC → IF valid → Code: build message → "Send" (mock: Code node logs + returns; swap for Email/Slack) → Respond 200. Invalid → Respond 401. Settings: errorWorkflow = error handler. Convex side retries the webhook call 3× with backoff and records a `failed` event if all fail; on success records `sent` with key `notify:<eventId>`.
2. **Overdue reminders**: Schedule (daily 09:00) → Code: sign request → HTTP Request POST /n8n/overdue (retry on fail 3×) → Split items → Send reminder (mock) → Code sign → HTTP POST /n8n/events with idempotencyKey reminderKey (retry 3×). Retries cannot duplicate reminders because the key is per loan per day; workflow also skips loans whose key already exists (endpoint returns `alreadyReminded`).
3. **Error handler**: Error Trigger → Code: format (workflow, node, execution URL, message) → log/mock alert. Set as error workflow for 1 & 2.
Exports contain no secrets: they read `$env.N8N_WEBHOOK_SECRET`, `$env.CONVEX_INBOUND_SECRET`, `$env.CONVEX_SITE_URL` (env access enabled in compose via `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`).

## 10. Env vars
Next: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
Convex (dashboard/`npx convex env set`): `CLERK_JWT_ISSUER_DOMAIN`, `N8N_NOTIFY_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `CONVEX_INBOUND_SECRET`, `ADMIN_EMAILS`.
n8n (.env for compose): `N8N_WEBHOOK_SECRET`, `CONVEX_INBOUND_SECRET`, `CONVEX_SITE_URL`, `N8N_ENCRYPTION_KEY`.

## 11. UX
Tailwind, neutral palette, single accent. Status pills, empty states, inline errors from Convex surfaced as toasts/text. ActivityBadge shows "Reminder sent 2 days ago" from latest automationEvent.

## 12. README outline
Overview · screenshots placeholder · quick start (Clerk app + JWT template, `npx convex dev`, env, `npm run dev`, `docker compose up` n8n, import workflows) · env table · architecture diagram (ASCII) · RBAC matrix · security & data minimization · reliability/idempotency · testing the integration (curl with signature script) · production notes.

## 13. Production notes
Clerk webhooks for user sync; secrets in a manager (AWS Secrets Manager) with rotation & dual-secret verification window; n8n on managed Postgres with queue mode, HTTPS, basic auth/SSO; real email provider with templates; rate limiting on mutations; audit log table for admin actions; observability (Sentry, Datadog); CI with typecheck/lint/tests; timezone-aware overdue logic; dead-letter queue for failed notifications.
