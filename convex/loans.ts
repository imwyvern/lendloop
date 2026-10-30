import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { overlaps, validateLoanDates } from "./lib/dates";
import { scheduleNotification } from "./lib/notifications";
import { loanView } from "./lib/views";

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id)).order("desc").collect();
    return Promise.all(loans.map((loan) => loanView(ctx, loan)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_owner", (q) => q.eq("ownerId", viewer._id)).order("desc").collect();
    return Promise.all(loans.map((loan) => loanView(ctx, loan)));
  },
});

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args): Promise<Id<"loans">> => {
    const viewer = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) throw new ConvexError("This listing no longer exists.");
    if (tool.ownerId === viewer._id) throw new ConvexError("You cannot borrow your own tool.");
    validateLoanDates(args.startDate, args.endDate);
    const now = Date.now();
    const id = await ctx.db.insert("loans", { ...args, ownerId: tool.ownerId, borrowerId: viewer._id, status: "requested", createdAt: now, updatedAt: now });
    await scheduleNotification(ctx, (await ctx.db.get(id))!, viewer._id);
    return id;
  },
});

export const decide = mutation({
  args: { id: v.id("loans"), decision: v.union(v.literal("approve"), v.literal("decline")) },
  handler: async (ctx, args): Promise<null> => {
    const viewer = await requireUser(ctx);
    const loan = await ctx.db.get(args.id);
    if (!loan || loan.ownerId !== viewer._id) throw new ConvexError("Only the owner can decide this request.");
    if (loan.status !== "requested") throw new ConvexError("This request has already been decided.");
    const status = args.decision === "approve" ? "approved" as const : "declined" as const;
    if (status === "approved") {
      if (!(await ctx.db.get(loan.toolId))) throw new ConvexError("A removed listing cannot be approved.");
      const otherLoans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", loan.toolId)).collect();
      if (otherLoans.some((other) => other._id !== loan._id && other.status === "approved" && overlaps(loan.startDate, loan.endDate, other.startDate, other.endDate))) {
        throw new ConvexError("This tool already has an approved loan for those dates.");
      }
    }
    const next = { ...loan, status, updatedAt: Date.now() };
    // Convex serializes this indexed read with the write; racing approvals retry.
    await ctx.db.patch(loan._id, { status, updatedAt: next.updatedAt });
    await scheduleNotification(ctx, next, viewer._id);
    return null;
  },
});

export const cancel = mutation({
  args: { id: v.id("loans") },
  handler: async (ctx, args): Promise<null> => {
    const viewer = await requireUser(ctx);
    const loan = await ctx.db.get(args.id);
    if (!loan || loan.borrowerId !== viewer._id) throw new ConvexError("Only the borrower can cancel this request.");
    if (loan.status !== "requested") throw new ConvexError("Only pending requests can be cancelled.");
    const next = { ...loan, status: "cancelled" as const, updatedAt: Date.now() };
    await ctx.db.patch(loan._id, { status: next.status, updatedAt: next.updatedAt });
    await scheduleNotification(ctx, next, viewer._id);
    return null;
  },
});

export const markReturned = mutation({
  args: { id: v.id("loans") },
  handler: async (ctx, args): Promise<null> => {
    const viewer = await requireUser(ctx);
    const loan = await ctx.db.get(args.id);
    if (!loan || (loan.ownerId !== viewer._id && loan.borrowerId !== viewer._id)) throw new ConvexError("Only a participant can mark this loan returned.");
    if (loan.status !== "approved") throw new ConvexError("Only approved loans can be marked returned.");
    const now = Date.now();
    const next = { ...loan, status: "returned" as const, updatedAt: now, returnedAt: now };
    await ctx.db.patch(loan._id, { status: next.status, updatedAt: now, returnedAt: now });
    await scheduleNotification(ctx, next, viewer._id);
    return null;
  },
});
