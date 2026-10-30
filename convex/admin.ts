import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { loanView } from "./lib/views";

export const allLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").collect();
    return Promise.all(loans.map((loan) => loanView(ctx, loan)));
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(args.userId))) throw new ConvexError("This lender no longer exists.");
    await ctx.db.patch(args.userId, { trusted: args.trusted });
    return null;
  },
});
