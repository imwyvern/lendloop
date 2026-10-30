import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";

export type NotificationPayload = {
  eventId: string;
  type: Doc<"loans">["status"];
  loanId: Id<"loans">;
  status: Doc<"loans">["status"];
  toolName: string;
  recipientName: string;
  recipientEmail: string;
  startDate: string;
  endDate: string;
};

export async function scheduleNotification(ctx: MutationCtx, loan: Doc<"loans">, actorId: Id<"users">): Promise<void> {
  // Each transition has one relevant recipient. A return tells the other party.
  const recipientId = loan.status === "requested" || loan.status === "cancelled"
    ? loan.ownerId
    : loan.status === "returned"
      ? actorId === loan.ownerId ? loan.borrowerId : loan.ownerId
      : loan.borrowerId;
  const [recipient, tool] = await Promise.all([ctx.db.get(recipientId), ctx.db.get(loan.toolId)]);
  if (!recipient) return;
  const payload: NotificationPayload = {
    eventId: `${loan._id}:${loan.status}:${loan.updatedAt}`,
    type: loan.status,
    loanId: loan._id,
    status: loan.status,
    toolName: tool?.name ?? "Removed listing",
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    startDate: loan.startDate,
    endDate: loan.endDate,
  };
  // Scheduler work starts only after this transaction has committed.
  await ctx.scheduler.runAfter(0, internal.automation.notify, payload);
}
