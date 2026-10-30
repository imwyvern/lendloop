#!/usr/bin/env node
/** Print a shell-safe curl command for the exact UTF-8 body; never print the secret. */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const usage = `Usage:
  node scripts/sign-test.mjs --url URL --secret-env ENV [--body JSON | --body-file PATH] [--timestamp UNIX_SECONDS] [--send]

Examples (load the private env file in your shell first):
  node scripts/sign-test.mjs --url "$CONVEX_SITE_URL/n8n/overdue" --secret-env CONVEX_INBOUND_SECRET --body '{}'
  node scripts/sign-test.mjs --url http://localhost:5678/webhook/lendloop-notify --secret-env N8N_WEBHOOK_SECRET --body-file /tmp/lendloop-notification.json

Default output is a curl command to inspect and run. --send sends the request
with Node's fetch instead. --timestamp supports testing expired signatures.
--body-file - reads stdin. A file's trailing newline is included in the HMAC.
The secret is read only from the named environment variable.
`;

function fail(message) {
  throw new Error(message);
}

function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function main() {
  const options = {};
  const valued = new Set(["--url", "--secret-env", "--body", "--body-file", "--timestamp"]);
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage);
      return;
    }
    if (arg === "--send") {
      options.send = true;
      continue;
    }
    if (!valued.has(arg)) fail(`Unknown argument: ${arg}. Use --help.`);
    if (options[arg] !== undefined) fail(`Repeated argument: ${arg}`);
    const value = process.argv[++i];
    if (value === undefined) fail(`Missing value for ${arg}`);
    options[arg] = value;
  }

  if (!options["--url"] || !options["--secret-env"]) fail("--url and --secret-env are required. Use --help.");
  const url = new URL(options["--url"]);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    fail("Use an HTTP(S) URL without embedded credentials.");
  }
  const envName = options["--secret-env"];
  if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) fail("--secret-env must be an environment variable name.");
  const secret = process.env[envName];
  if (!secret || /^(?:replace[-_ ]|<|your[-_ ])/i.test(secret)) {
    fail(`Set ${envName} to the private shared secret before signing.`);
  }
  if (options["--body"] !== undefined && options["--body-file"] !== undefined) {
    fail("Use either --body or --body-file.");
  }
  const body = options["--body-file"] === undefined
    ? Buffer.from(options["--body"] ?? "{}", "utf8")
    : readFileSync(options["--body-file"] === "-" ? 0 : options["--body-file"]);
  const rawBody = new TextDecoder("utf-8", { fatal: true }).decode(body);
  // Re-encoding must preserve every signed byte, including whitespace/newlines.
  if (!Buffer.from(rawBody, "utf8").equals(body)) fail("Body must be UTF-8 without a byte-order mark.");
  JSON.parse(rawBody);
  const timestamp = options["--timestamp"] ?? String(Math.floor(Date.now() / 1000));
  if (!/^\d{1,12}$/.test(timestamp)) fail("--timestamp must be Unix seconds.");
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex")}`;
  const headers = {
    "Content-Type": "application/json",
    "X-LendLoop-Timestamp": timestamp,
    "X-LendLoop-Signature": signature,
  };

  if (options.send) {
    const response = await fetch(url, { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(30000) });
    process.stdout.write(`HTTP ${response.status}\n${await response.text()}\n`);
    if (!response.ok) process.exitCode = 1;
    return;
  }
  const args = ["curl --include --fail-with-body --request POST", quote(url.href)];
  for (const [name, value] of Object.entries(headers)) args.push(`--header ${quote(`${name}: ${value}`)}`);
  args.push(`--data-binary ${quote(rawBody)}`);
  process.stdout.write(`${args.join(" \\\n  ")}\n`);
}

main().catch((error) => {
  process.stderr.write(`sign-test: ${error.message}\n`);
  process.exitCode = 1;
});
