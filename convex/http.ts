import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { verify } from "./lib/hmac";

const http = httpRouter();
const MAX_BODY_BYTES = 16_384;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function authenticatedBody(request: Request): Promise<{ value: Record<string, unknown> } | { response: Response }> {
  const secret = process.env.CONVEX_INBOUND_SECRET;
  if (!secret) return { response: json({ error: "Integration is not configured." }, 503) };
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return { response: json({ error: "Body is too large." }, 413) };
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return { response: json({ error: "Body is too large." }, 413) };
  const valid = await verify(secret, request.headers.get("X-LendLoop-Timestamp"), request.headers.get("X-LendLoop-Signature"), rawBody);
  if (!valid) return { response: json({ error: "Invalid signature or expired timestamp." }, 401) };
  try {
    const value: unknown = JSON.parse(rawBody);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { response: json({ error: "Expected a JSON object." }, 400) };
    return { value: value as Record<string, unknown> };
  } catch {
    return { response: json({ error: "Invalid JSON." }, 400) };
  }
}

http.route({
  path: "/n8n/overdue",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await authenticatedBody(request);
    if ("response" in body) return body.response;
    if (Object.keys(body.value).length !== 0) return json({ error: "Send an empty JSON object." }, 400);
    return json(await ctx.runQuery(internal.automation.overdue, {}));
  }),
});

http.route({
  path: "/n8n/events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await authenticatedBody(request);
    if ("response" in body) return body.response;
    const value = body.value;
    const allowed = new Set(["loanId", "kind", "status", "idempotencyKey", "detail"]);
    if (
      Object.keys(value).some((key) => !allowed.has(key)) ||
      typeof value.loanId !== "string" || !value.loanId || value.loanId.length > 128 ||
      (value.kind !== "notification" && value.kind !== "overdue_reminder") ||
      (value.status !== "sent" && value.status !== "failed") ||
      typeof value.idempotencyKey !== "string" || !value.idempotencyKey || value.idempotencyKey.length > 256 ||
      (value.detail !== undefined && (typeof value.detail !== "string" || value.detail.length > 500))
    ) return json({ error: "Invalid automation event." }, 400);
    try {
      const result = await ctx.runMutation(internal.automation.recordEvent, {
        loanId: value.loanId as Id<"loans">,
        kind: value.kind,
        status: value.status,
        idempotencyKey: value.idempotencyKey,
        ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
      });
      return json(result);
    } catch {
      return json({ error: "Invalid loan or automation event key." }, 400);
    }
  }),
});

export default http;
