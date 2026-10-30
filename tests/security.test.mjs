import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

// Load the actual backend handlers without a deployment or another test package.
// This exercises handler logic; Convex validator/OCC behavior needs staging.
const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
const { sign, verify } = require("../convex/lib/hmac.ts");
const { todayUTC, validDate, validateLoanDates, overlaps } = require("../convex/lib/dates.ts");
const tools = require("../convex/tools.ts");
const loans = require("../convex/loans.ts");
const users = require("../convex/users.ts");
const admin = require("../convex/admin.ts");
const automation = require("../convex/automation.ts");
const http = require("../convex/http.ts").default;

function fixture(subject = "borrower") {
  const rows = new Map();
  const scheduled = [];
  let sequence = 0;
  const add = (table, key, data) => {
    const row = { _id: `${table}:${key}`, _creationTime: sequence++, ...data };
    rows.set(row._id, row);
    return row;
  };
  for (const [key, role] of [["owner", "user"], ["borrower", "user"], ["outsider", "user"], ["admin", "admin"]]) {
    add("users", key, { clerkId: key, name: key === "owner" ? "Lender" : "Member", email: `${key}@example.invalid`, role, trusted: false });
  }
  add("tools", "drill", { ownerId: "users:owner", name: "Cordless drill", category: "power tools", condition: "good", description: "For household projects.", createdAt: 1 });
  const ctx = {
    auth: { getUserIdentity: async () => subject ? { subject, email: `${subject}@example.invalid`, name: "Member", emailVerified: true } : null },
    db: {
      get: async (id) => rows.get(id) ?? null,
      insert: async (table, data) => add(table, String(sequence++), data)._id,
      patch: async (id, data) => rows.set(id, { ...rows.get(id), ...data }),
      delete: async (id) => rows.delete(id),
      query: (table) => {
        let conditions = [];
        let direction = "asc";
        const select = () => [...rows.values()].filter((row) => row._id.startsWith(`${table}:`) && conditions.every(([field, value]) => row[field] === value)).sort((a, b) => direction === "asc" ? a._creationTime - b._creationTime : b._creationTime - a._creationTime);
        const chain = {
          withIndex: (_index, callback) => {
            const builder = { eq: (field, value) => { conditions.push([field, value]); return builder; } };
            callback?.(builder);
            return chain;
          },
          order: (value) => { direction = value; return chain; },
          collect: async () => select(),
          first: async () => select()[0] ?? null,
          unique: async () => { const matches = select(); assert.ok(matches.length <= 1); return matches[0] ?? null; },
        };
        return chain;
      },
    },
    scheduler: { runAfter: async (delay, _reference, payload) => scheduled.push({ delay, payload }) },
  };
  return { ctx, rows, add, scheduled };
}

test("HMAC matches Node crypto and rejects tampering, stale/future timestamps and missing config", async () => {
  const secret = randomBytes(32).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  const body = '{ "message": "Borrow ☀", "value": 1 }\n';
  const timestamp = String(now);
  const signature = await sign(secret, timestamp, body);
  assert.equal(signature, `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`);
  assert.equal(await verify(secret, timestamp, signature, body, now), true);
  assert.equal(await verify(secret, timestamp, signature.toUpperCase().replace("SHA256", "sha256"), body, now), true);
  for (const [key, time, digest, bytes] of [
    [secret, timestamp, signature, body.trim()],
    [secret, timestamp, `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`, body],
    [secret, String(now - 301), signature, body],
    [secret, String(now + 301), signature, body],
    [secret, "1.2", signature, body],
    [secret, timestamp, "sha256=no", body],
    ["", timestamp, signature, body],
    [secret, null, signature, body],
  ]) assert.equal(await verify(key, time, digest, bytes, now), false);
  assert.equal(await verify(secret, timestamp, signature, body, now + 300), true);
  await assert.rejects(sign("", timestamp, body), /not configured/);
});

test("dates reject invalid calendars and enforce inclusive 30-day loans", () => {
  const start = todayUTC();
  const shift = (days) => new Date(Date.parse(`${start}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  assert.equal(validDate("2025-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("2028-2-01"), false);
  assert.doesNotThrow(() => validateLoanDates(start, shift(29)));
  assert.throws(() => validateLoanDates(start, shift(30)), /30 days/);
  assert.throws(() => validateLoanDates(shift(-1), start), /today/);
  assert.throws(() => validateLoanDates(shift(1), start), /on or after/);
  assert.equal(overlaps("2028-01-01", "2028-01-03", "2028-01-03", "2028-01-04"), true);
  assert.equal(overlaps("2028-01-01", "2028-01-03", "2028-01-04", "2028-01-05"), false);
});

test("public projection is minimal and excludes tools currently on loan", async () => {
  const { ctx, add } = fixture(null);
  assert.deepEqual(await tools.listPublic._handler(ctx, {}), [{ _id: "tools:drill", name: "Cordless drill", category: "power tools" }]);
  add("loans", "active", { toolId: "tools:drill", ownerId: "users:owner", borrowerId: "users:borrower", startDate: todayUTC(), endDate: todayUTC(), status: "approved" });
  assert.deepEqual(await tools.listPublic._handler(ctx, {}), []);
  await assert.rejects(tools.listAll._handler(ctx, {}), /Sign in/);
});

test("RBAC rejects member listing edits/removal and admin-only operations", async () => {
  const { ctx } = fixture("outsider");
  const fields = { id: "tools:drill", name: "Different name", category: "garden", condition: "good", description: "" };
  await assert.rejects(tools.update._handler(ctx, fields), /own listings/);
  await assert.rejects(tools.remove._handler(ctx, { id: fields.id }), /own listings/);
  await assert.rejects(admin.allLoans._handler(ctx, {}), /Administrator/);
  await assert.rejects(admin.setTrusted._handler(ctx, { userId: "users:owner", trusted: true }), /Administrator/);
  const administrative = fixture("admin");
  await assert.rejects(tools.update._handler(administrative.ctx, fields), /own listings/);
  await admin.setTrusted._handler(administrative.ctx, { userId: "users:owner", trusted: true });
  assert.equal(administrative.rows.get("users:owner").trusted, true);
  await tools.remove._handler(administrative.ctx, { id: fields.id });
  assert.equal(administrative.rows.has(fields.id), false);
});

test("requests derive participants from identity and schedule only recipient contact", async () => {
  const { ctx, rows, scheduled } = fixture();
  const id = await loans.request._handler(ctx, { toolId: "tools:drill", startDate: todayUTC(), endDate: todayUTC() });
  assert.equal(rows.get(id).borrowerId, "users:borrower");
  assert.equal(rows.get(id).ownerId, "users:owner");
  assert.equal(rows.get(id).status, "requested");
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 0);
  const payload = scheduled[0].payload;
  assert.equal(payload.recipientEmail, "owner@example.invalid");
  assert.deepEqual(Object.keys(payload).sort(), ["eventId", "type", "loanId", "status", "toolName", "recipientName", "recipientEmail", "startDate", "endDate"].sort());
  assert.equal(JSON.stringify(payload).includes("borrower@example.invalid"), false);
  await assert.rejects(loans.request._handler(fixture("owner").ctx, { toolId: "tools:drill", startDate: todayUTC(), endDate: todayUTC() }), /own tool/);
});

test("loan state transitions enforce participation, pending cancellation, overlap and return status", async () => {
  const sample = { toolId: "tools:drill", ownerId: "users:owner", borrowerId: "users:borrower", startDate: todayUTC(), endDate: todayUTC(), status: "requested", createdAt: 1, updatedAt: 1 };
  const outsider = fixture("outsider");
  outsider.add("loans", "pending", sample);
  await assert.rejects(loans.decide._handler(outsider.ctx, { id: "loans:pending", decision: "approve" }), /Only the owner/);
  await assert.rejects(loans.cancel._handler(outsider.ctx, { id: "loans:pending" }), /Only the borrower/);
  await assert.rejects(loans.markReturned._handler(outsider.ctx, { id: "loans:pending" }), /Only a participant/);
  const owner = fixture("owner");
  owner.add("loans", "pending", sample);
  owner.add("loans", "approved", { ...sample, status: "approved" });
  await assert.rejects(loans.decide._handler(owner.ctx, { id: "loans:pending", decision: "approve" }), /already has an approved loan/);
  await loans.decide._handler(owner.ctx, { id: "loans:pending", decision: "decline" });
  assert.equal(owner.rows.get("loans:pending").status, "declined");
  await assert.rejects(loans.decide._handler(owner.ctx, { id: "loans:pending", decision: "approve" }), /already been decided/);
  const borrower = fixture();
  borrower.add("loans", "approved", { ...sample, status: "approved" });
  await assert.rejects(loans.cancel._handler(borrower.ctx, { id: "loans:approved" }), /Only pending/);
  await loans.markReturned._handler(borrower.ctx, { id: "loans:approved" });
  assert.equal(borrower.rows.get("loans:approved").status, "returned");
  assert.equal(typeof borrower.rows.get("loans:approved").returnedAt, "number");
  await assert.rejects(loans.markReturned._handler(borrower.ctx, { id: "loans:approved" }), /Only approved/);
});

test("first verified allowlisted identity bootstraps admin; subsequent ensures preserve DB role", async () => {
  const previous = process.env.ADMIN_EMAILS;
  try {
    process.env.ADMIN_EMAILS = "new@example.invalid";
    const current = fixture("new");
    const created = await users.ensure._handler(current.ctx, {});
    assert.equal(created.role, "admin");
    await current.ctx.db.patch(created._id, { role: "user", trusted: true });
    const existing = await users.ensure._handler(current.ctx, {});
    assert.equal(existing.role, "user");
    assert.equal(existing.trusted, true);
    const unverified = fixture("new");
    unverified.ctx.auth.getUserIdentity = async () => ({ subject: "new", email: "new@example.invalid", emailVerified: false });
    assert.equal((await users.ensure._handler(unverified.ctx, {})).role, "user");
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previous;
  }
});

test("daily event writebacks are idempotent and overdue response reflects the recorded key", async () => {
  const { ctx, add, rows } = fixture();
  const yesterday = new Date(Date.parse(`${todayUTC()}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  add("loans", "overdue", { toolId: "tools:drill", ownerId: "users:owner", borrowerId: "users:borrower", startDate: yesterday, endDate: yesterday, status: "approved", createdAt: 1, updatedAt: 1 });
  const event = { loanId: "loans:overdue", kind: "overdue_reminder", status: "sent", idempotencyKey: `loans:overdue:${todayUTC()}` };
  let response = await automation.overdue._handler(ctx, {});
  assert.equal(response.loans.length, 1);
  assert.equal(response.loans[0].alreadyReminded, false);
  assert.equal(JSON.stringify(response).includes("owner@example.invalid"), false);
  assert.deepEqual(await automation.recordEvent._handler(ctx, event), { duplicate: false });
  assert.deepEqual(await automation.recordEvent._handler(ctx, event), { duplicate: true });
  assert.equal([...rows.values()].filter((row) => row._id.startsWith("automationEvents:")).length, 1);
  response = await automation.overdue._handler(ctx, {});
  assert.equal(response.loans[0].alreadyReminded, true);
});

test("HTTP routes verify raw bytes before reaching internal functions and validate event bodies", async () => {
  const previous = process.env.CONVEX_INBOUND_SECRET;
  const secret = randomBytes(32).toString("hex");
  process.env.CONVEX_INBOUND_SECRET = secret;
  let calls = 0;
  const ctx = {
    runQuery: async () => { calls++; return { loans: [] }; },
    runMutation: async (_reference, args) => { calls++; return { duplicate: args.idempotencyKey.endsWith(":repeat") }; },
  };
  const call = async (path, body, options = {}) => {
    const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
    const headers = { "Content-Type": "application/json" };
    if (!options.unsigned) {
      headers["X-LendLoop-Timestamp"] = timestamp;
      headers["X-LendLoop-Signature"] = await sign(secret, timestamp, options.signBody ?? body);
    }
    const [handler] = http.lookup(path, "POST");
    return handler._handler(ctx, new Request(`https://example.invalid${path}`, { method: "POST", headers, body }));
  };
  try {
    assert.equal((await call("/n8n/overdue", "{}", { unsigned: true })).status, 401);
    assert.equal((await call("/n8n/overdue", "{ }", { signBody: "{}" })).status, 401);
    assert.equal((await call("/n8n/overdue", "{}", { timestamp: "1" })).status, 401);
    assert.equal((await call("/n8n/overdue", "not-json")).status, 400);
    assert.equal((await call("/n8n/overdue", "{\"extra\":true}")).status, 400);
    assert.equal(calls, 0);
    const response = await call("/n8n/overdue", "{}\n");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { loans: [] });
    assert.equal(calls, 1);
    assert.equal((await call("/n8n/events", JSON.stringify({ loanId: "a", kind: "bad", status: "sent", idempotencyKey: "a" }))).status, 400);
    const eventResponse = await call("/n8n/events", JSON.stringify({ loanId: "a", kind: "notification", status: "sent", idempotencyKey: "notify:a:repeat" }));
    assert.equal(eventResponse.status, 200);
    assert.deepEqual(await eventResponse.json(), { duplicate: true });
    assert.equal(calls, 2);
    delete process.env.CONVEX_INBOUND_SECRET;
    assert.equal((await call("/n8n/overdue", "{}")).status, 503);
    assert.equal(calls, 2);
  } finally {
    if (previous === undefined) delete process.env.CONVEX_INBOUND_SECRET;
    else process.env.CONVEX_INBOUND_SECRET = previous;
  }
});

test("notification delivery signs its snapshot, retries three times, and records exhausted failure", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.N8N_NOTIFY_WEBHOOK_URL;
  const previousSecret = process.env.N8N_WEBHOOK_SECRET;
  const previousConsoleError = console.error;
  const secret = randomBytes(32).toString("hex");
  process.env.N8N_NOTIFY_WEBHOOK_URL = "https://example.invalid/webhook/lendloop-notify";
  process.env.N8N_WEBHOOK_SECRET = secret;
  const payload = {
    eventId: "loans:test:requested:1", type: "requested", loanId: "loans:test", status: "requested",
    toolName: "Drill", recipientName: "Lender", recipientEmail: "owner@example.invalid", startDate: todayUTC(), endDate: todayUTC(),
  };
  const recorded = [];
  let deliveries = 0;
  const ctx = {
    runQuery: async () => false,
    runMutation: async (_reference, event) => { recorded.push(event); return { duplicate: false }; },
  };
  try {
    globalThis.fetch = async (_url, options) => {
      deliveries++;
      assert.equal(await verify(secret, options.headers["X-LendLoop-Timestamp"], options.headers["X-LendLoop-Signature"], options.body), true);
      assert.deepEqual(JSON.parse(options.body), payload);
      return new Response("", { status: 503 });
    };
    console.error = () => {};
    await automation.notify._handler(ctx, payload);
    assert.equal(deliveries, 3);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].status, "failed");
    assert.equal(recorded[0].idempotencyKey, `notify:${payload.eventId}`);
    assert.equal(JSON.stringify(recorded).includes(payload.recipientEmail), false);
    deliveries = 0;
    recorded.length = 0;
    globalThis.fetch = async () => { deliveries++; return new Response("", { status: 200 }); };
    await automation.notify._handler(ctx, payload);
    assert.equal(deliveries, 1);
    assert.equal(recorded[0].status, "sent");
    ctx.runQuery = async () => true;
    await automation.notify._handler(ctx, payload);
    assert.equal(deliveries, 1);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
    if (previousUrl === undefined) delete process.env.N8N_NOTIFY_WEBHOOK_URL;
    else process.env.N8N_NOTIFY_WEBHOOK_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = previousSecret;
  }
});
