import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const root = new URL("../", import.meta.url);
const workflows = Object.fromEntries(["request-notification", "overdue-reminders", "error-handler"].map((name) => [
  name, JSON.parse(readFileSync(new URL(`n8n/workflows/${name}.json`, root), "utf8")),
]));
const findNode = (workflow, name) => {
  const node = workflows[workflow].nodes.find((item) => item.name === name);
  assert.ok(node, `Missing node ${name}`);
  return node;
};
const env = {
  N8N_WEBHOOK_SECRET: "fixture-only-not-a-real-secret-for-receiver",
  CONVEX_INBOUND_SECRET: "fixture-only-not-a-real-secret-for-sender",
  CONVEX_SITE_URL: "https://fixture.convex.site",
  N8N_ENCRYPTION_KEY: "fixture-only-not-a-real-encryption-key",
};
const payload = {
  eventId: "fixture-event",
  type: "requested",
  loanId: "fixture-loan",
  status: "requested",
  toolName: "Cordless drill",
  recipientName: "Tool owner",
  recipientEmail: "owner@example.invalid",
  startDate: "2026-11-01",
  endDate: "2026-11-02",
};
function signature(secret, timestamp, body) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex")}`;
}
async function runCode(workflow, nodeName, items, options = {}) {
  const node = findNode(workflow, nodeName);
  const fn = new AsyncFunction("require", "$env", "$input", "$getWorkflowStaticData", "console", node.parameters.jsCode);
  const logs = [];
  const state = options.state ?? {};
  const result = await fn.call({ helpers: { getBinaryDataBuffer: async () => options.rawBody } }, require, options.env ?? env,
    { first: () => items[0], all: () => items }, () => state,
    { log: (...args) => logs.push(args.join(" ")), error: (...args) => logs.push(args.join(" ")) });
  return { result, logs, state };
}
function incoming(rawBody, timestamp = String(Math.floor(Date.now() / 1000)), options = {}) {
  return {
    json: {
      // This parsed representation must never be used to compute the MAC.
      body: { deliberatelyDifferent: true },
      headers: {
        "x-lendloop-timestamp": timestamp,
        "x-lendloop-signature": options.signature ?? signature(env.N8N_WEBHOOK_SECRET, timestamp, rawBody),
      },
    },
    ...(options.missingBinary ? {} : { binary: { data: { data: rawBody.toString("base64") } } }),
  };
}

test("n8n exports have resolvable graphs, stable error workflow references, and compile", () => {
  const errorId = workflows["error-handler"].id;
  assert.equal(errorId, "LendLoopErrors01");
  assert.equal(new Set(Object.values(workflows).map((workflow) => workflow.id)).size, 3);
  for (const [name, workflow] of Object.entries(workflows)) {
    assert.equal(workflow.active, false, "Imports must not automatically send or schedule work");
    assert.equal(workflow.settings.timezone, "UTC");
    if (name !== "error-handler") assert.equal(workflow.settings.errorWorkflow, errorId);
    const names = new Set(workflow.nodes.map((node) => node.name));
    assert.equal(names.size, workflow.nodes.length);
    for (const [source, outputs] of Object.entries(workflow.connections)) {
      assert.ok(names.has(source));
      for (const branch of outputs.main) for (const target of branch) assert.ok(names.has(target.node), target.node);
    }
    for (const node of workflow.nodes) {
      if (node.type === "n8n-nodes-base.code") {
        assert.doesNotThrow(() => new AsyncFunction("require", "$env", "$input", "$getWorkflowStaticData", "console", node.parameters.jsCode));
      }
    }
  }
  assert.equal(findNode("request-notification", "Notification webhook").parameters.options.rawBody, true);
  assert.equal(findNode("request-notification", "Notification webhook").parameters.responseMode, "responseNode");
  assert.equal(findNode("request-notification", "Respond 401").parameters.options.responseCode, 401);
  assert.equal(findNode("request-notification", "Respond 200").parameters.options.responseCode, 200);
  const branches = workflows["request-notification"].connections["Valid signature?"].main;
  assert.equal(branches[0][0].node, "Build message");
  assert.equal(branches[1][0].node, "Respond 401");
  assert.deepEqual(findNode("overdue-reminders", "Daily 09:00 UTC").parameters.rule.interval,
    [{ field: "cronExpression", expression: "0 9 * * *" }]);
});

test("notification HMAC accepts original bytes and minimizes the authenticated payload", async () => {
  const rawBody = Buffer.from(JSON.stringify({ ...payload, counterpartyEmail: "private@example.invalid" }, null, 2) + "\n");
  const { result } = await runCode("request-notification", "Verify HMAC", [incoming(rawBody)], { rawBody });
  assert.equal(result[0].json.valid, true);
  assert.deepEqual(result[0].json.payload, payload);
});

test("notification HMAC rejects tampering, stale/future timestamps, malformed MACs, and missing raw bytes", async () => {
  const rawBody = Buffer.from(JSON.stringify(payload, null, 2) + "\n");
  const cases = [
    { item: incoming(rawBody), rawBody: Buffer.from(JSON.stringify(payload)) },
    { item: incoming(rawBody, String(Math.floor(Date.now() / 1000) - 301)), rawBody },
    { item: incoming(rawBody, String(Math.floor(Date.now() / 1000) + 301)), rawBody },
    { item: incoming(rawBody, undefined, { signature: "sha256=00" }), rawBody },
    { item: incoming(rawBody, undefined, { signature: `sha256=${"0".repeat(64)}` }), rawBody },
    { item: incoming(rawBody, undefined, { missingBinary: true }), rawBody },
    { item: incoming(rawBody, "1e10"), rawBody },
  ];
  for (const fixture of cases) {
    const { result } = await runCode("request-notification", "Verify HMAC", [fixture.item], { rawBody: fixture.rawBody });
    assert.deepEqual(result, [{ json: { valid: false } }]);
  }
});

test("mock notifications suppress completed event replays and never log recipient contacts", async () => {
  const state = {};
  const built = await runCode("request-notification", "Build message", [{ json: { payload } }], { state });
  assert.equal(built.result[0].json.duplicate, false);
  const sent = await runCode("request-notification", "Mock send notification", built.result, { state });
  assert.equal(sent.result[0].json.ok, true);
  assert.equal(sent.logs.length, 1);
  assert.ok(!sent.logs.join("").includes(payload.recipientEmail));
  assert.ok(!sent.logs.join("").includes(payload.recipientName));
  const replay = await runCode("request-notification", "Build message", [{ json: { payload } }], { state });
  assert.equal(replay.result[0].json.duplicate, true);
  const replaySent = await runCode("request-notification", "Mock send notification", replay.result, { state });
  assert.equal(replaySent.logs.length, 0);
});

test("overdue requests sign the exact raw body and only HTTP operations retry", async () => {
  const { result } = await runCode("overdue-reminders", "Sign overdue request", [{ json: {} }]);
  const signed = result[0].json;
  assert.equal(signed.url, `${env.CONVEX_SITE_URL}/n8n/overdue`);
  assert.equal(signed.rawBody, "{}");
  assert.equal(signed.signature, signature(env.CONVEX_INBOUND_SECRET, signed.timestamp, signed.rawBody));
  for (const name of ["Fetch overdue loans", "Write reminder event"]) {
    const node = findNode("overdue-reminders", name);
    assert.equal(node.retryOnFail, true);
    assert.equal(node.maxTries, 3);
    assert.equal(node.parameters.contentType, "raw");
    assert.equal(node.parameters.rawContentType, "application/json");
    assert.equal(node.parameters.body, "={{ $json.rawBody }}");
  }
  assert.notEqual(findNode("overdue-reminders", "Mock send reminder").retryOnFail, true);
  assert.equal(findNode("overdue-reminders", "Each overdue loan").parameters.batchSize, 1);
  // Each item reaches the signing step immediately before its own HTTP retries,
  // so large reminder sets cannot age the later signatures past five minutes.
  assert.equal(workflows["overdue-reminders"].connections["Each overdue loan"].main[1][0].node, "Mock send reminder");
  assert.equal(workflows["overdue-reminders"].connections["Write reminder event"].main[0][0].node, "Each overdue loan");
});

test("overdue workflow skips prior and duplicate keys, sends minimal mock, signs idempotent writeback", async () => {
  const loan = {
    loanId: "fixture-loan", borrowerName: "Borrower", borrowerEmail: "borrower@example.invalid",
    toolName: "Cordless drill", endDate: "2026-10-28", reminderKey: "fixture-loan:2026-10-30", alreadyReminded: false,
    counterpartyEmail: "private@example.invalid",
  };
  const { result } = await runCode("overdue-reminders", "Split and skip reminded", [{ json: { loans: [
    { ...loan, loanId: "already-reminded", reminderKey: "other-key", alreadyReminded: true }, loan, loan,
  ] } }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].json.reminderKey, loan.reminderKey);
  assert.ok(!Object.hasOwn(result[0].json, "counterpartyEmail"));
  const sent = await runCode("overdue-reminders", "Mock send reminder", result);
  assert.equal(sent.logs.length, 1);
  assert.ok(!sent.logs[0].includes(loan.borrowerEmail));
  const signed = await runCode("overdue-reminders", "Sign reminder writeback", sent.result);
  const request = signed.result[0].json;
  assert.equal(request.url, `${env.CONVEX_SITE_URL}/n8n/events`);
  assert.equal(request.signature, signature(env.CONVEX_INBOUND_SECRET, request.timestamp, request.rawBody));
  assert.deepEqual(JSON.parse(request.rawBody), {
    loanId: loan.loanId, kind: "overdue_reminder", status: "sent", idempotencyKey: loan.reminderKey,
    detail: "Mock overdue reminder logged by n8n",
  });
  const empty = await runCode("overdue-reminders", "Split and skip reminded", [{ json: { loans: [] } }]);
  assert.deepEqual(empty.result, []);
});

test("error alerts retain diagnosis fields while redacting configured secrets and contact data", async () => {
  const { result } = await runCode("error-handler", "Format safe alert", [{ json: {
    workflow: { name: "Fixture workflow" },
    execution: { url: "https://n8n.example.invalid/execution/1?token=private", lastNodeExecuted: "Fixture node",
      error: { message: `${env.CONVEX_INBOUND_SECRET} borrower@example.invalid`, stack: "not for logging" } },
  } }]);
  assert.equal(result[0].json.workflow, "Fixture workflow");
  assert.equal(result[0].json.node, "Fixture node");
  assert.equal(result[0].json.executionUrl, "https://n8n.example.invalid/execution/1");
  assert.equal(result[0].json.message, "[redacted] [email redacted]");
  assert.ok(!Object.hasOwn(result[0].json, "stack"));
});

function exec(command, args, childEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: childEnv });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

test("sign-test CLI signs literal UTF-8 bytes and its printed curl safely quotes shell characters", async () => {
  const secret = randomBytes(32).toString("hex");
  const rawBody = JSON.stringify({ text: "literal ' and $(printf unsafe) and `printf unsafe`", unicode: "Tool library — ready" }) + "\n";
  const server = createServer((request, response) => {
    const parts = [];
    request.on("data", (chunk) => parts.push(chunk));
    request.on("end", () => {
      const receivedBody = Buffer.concat(parts);
      const timestamp = request.headers["x-lendloop-timestamp"];
      const valid = receivedBody.toString() === rawBody && request.headers["x-lendloop-signature"] === signature(secret, timestamp, receivedBody);
      response.writeHead(valid ? 200 : 401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: valid }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/verify`;
    const args = ["scripts/sign-test.mjs", "--url", url, "--secret-env", "LENDLOOP_FIXTURE_SECRET", "--body", rawBody];
    const childEnv = { ...process.env, LENDLOOP_FIXTURE_SECRET: secret };
    const generated = await exec(process.execPath, args, childEnv);
    assert.equal(generated.code, 0, generated.stderr);
    assert.ok(!generated.stdout.includes(secret), "The secret must never be printed");
    const curl = await exec("/bin/sh", ["-c", generated.stdout], process.env);
    assert.equal(curl.code, 0, curl.stderr);
    assert.match(curl.stdout, /"ok":true/);
    const direct = await exec(process.execPath, [...args, "--send"], childEnv);
    assert.equal(direct.code, 0, direct.stderr);
    assert.match(direct.stdout, /HTTP 200/);
    assert.match(direct.stdout, /"ok":true/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
