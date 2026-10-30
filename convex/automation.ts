import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { todayUTC, validDate } from "./lib/dates";
import { sign } from "./lib/hmac";
import { eventKind, eventStatus, loanStatus, notificationType } from "./lib/validators";

export type OverdueLoan = {
  loanId: Id<"loans">;
  borrowerName: string;
  borrowerEmail: string;
  toolName: string;
  endDate: string;
  reminderKey: string;
  alreadyReminded: boolean;
};

export const overdue = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ loans: OverdueLoan[] }> => {
    const today = todayUTC();
    const loans = await ctx.db.query("loans").withIndex("by_status", (q) => q.eq("status", "approved")).collect();
    const overdueLoans: OverdueLoan[] = [];
    for (const loan of loans) {
      if (loan.endDate >= today || loan.returnedAt !== undefined) continue;
      const reminderKey = `${loan._id}:${today}`;
      const [borrower, tool, event] = await Promise.all([
        ctx.db.get(loan.borrowerId),
        ctx.db.get(loan.toolId),
        ctx.db.query("automationEvents").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", reminderKey)).unique(),
      ]);
      if (!borrower) continue;
      overdueLoans.push({
        loanId: loan._id,
        borrowerName: borrower.name,
        borrowerEmail: borrower.email,
        toolName: tool?.name ?? "Removed listing",
        endDate: loan.endDate,
        reminderKey,
        alreadyReminded: event !== null,
      });
    }
    return { loans: overdueLoans };
  },
});

export const eventExists = internalQuery({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    return (await ctx.db.query("automationEvents").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique()) !== null;
  },
});

export const recordEvent = internalMutation({
  args: {
    loanId: v.id("loans"),
    kind: eventKind,
    status: eventStatus,
    idempotencyKey: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ duplicate: boolean }> => {
    if (args.idempotencyKey.length > 256 || (args.detail?.length ?? 0) > 500) throw new ConvexError("Automation event is too long.");
    if (!(await ctx.db.get(args.loanId))) throw new ConvexError("Unknown loan.");
    if (args.kind === "overdue_reminder") {
      const prefix = `${args.loanId}:`;
      const date = args.idempotencyKey.slice(prefix.length);
      if (!args.idempotencyKey.startsWith(prefix) || !validDate(date) || date > todayUTC()) throw new ConvexError("Invalid reminder key.");
    } else if (!args.idempotencyKey.startsWith(`notify:${args.loanId}:`)) {
      throw new ConvexError("Invalid notification key.");
    }
    const existing = await ctx.db.query("automationEvents").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) return { duplicate: true };
    // The index read and insert share a serializable transaction: racing retries
    // cannot create two rows for the same idempotency key.
    await ctx.db.insert("automationEvents", { ...args, createdAt: Date.now() });
    return { duplicate: false };
  },
});

export const notify = internalAction({
  args: {
    eventId: v.string(),
    type: notificationType,
    loanId: v.id("loans"),
    status: loanStatus,
    toolName: v.string(),
    recipientName: v.string(),
    recipientEmail: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, payload): Promise<void> => {
    const idempotencyKey = `notify:${payload.eventId}`;
    if (await ctx.runQuery(internal.automation.eventExists, { idempotencyKey })) return;
    const url = process.env.N8N_NOTIFY_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    let failure = "Notification webhook URL or secret is not configured.";
    if (url && secret) {
      // Serialize exactly once. The signature always covers the bytes we send.
      const rawBody = JSON.stringify(payload);
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const signature = await sign(secret, timestamp, rawBody);
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-LendLoop-Timestamp": timestamp, "X-LendLoop-Signature": signature },
            body: rawBody,
            signal: controller.signal,
            redirect: "error",
          });
          // No response body or recipient contact is written to application logs.
          if (response.ok) {
            await ctx.runMutation(internal.automation.recordEvent, { loanId: payload.loanId, kind: "notification", status: "sent", idempotencyKey });
            return;
          }
          failure = `Webhook returned HTTP ${response.status} after attempt ${attempt + 1}.`;
        } catch {
          failure = `Webhook delivery failed or timed out after attempt ${attempt + 1}.`;
        } finally {
          clearTimeout(timeout);
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    await ctx.runMutation(internal.automation.recordEvent, { loanId: payload.loanId, kind: "notification", status: "failed", idempotencyKey, detail: failure });
    console.error("LendLoop notification failed", { eventId: payload.eventId, reason: failure });
  },
});
