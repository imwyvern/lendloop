import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { todayUTC } from "./lib/dates";
import { category, condition } from "./lib/validators";
import { toolView } from "./lib/views";

const toolFields = { name: v.string(), category, condition, description: v.string() };

function validateFields(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > 100) throw new ConvexError("Tool names must be between 2 and 100 characters.");
  if (description.length > 1000) throw new ConvexError("Descriptions must be at most 1,000 characters.");
  return { name, description };
}

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const [tools, approved] = await Promise.all([
      ctx.db.query("tools").order("desc").collect(),
      ctx.db.query("loans").withIndex("by_status", (q) => q.eq("status", "approved")).collect(),
    ]);
    const today = todayUTC();
    const onLoan = new Set(approved.filter((loan) => loan.startDate <= today && loan.endDate >= today).map((loan) => loan.toolId));
    // The public projection deliberately has neither owner data nor descriptions.
    return tools.filter((tool) => !onLoan.has(tool._id)).map(({ _id, name, category }) => ({ _id, name, category }));
  },
});

export const listAll = query({
  args: { category: v.optional(category) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const tools = args.category
      ? await ctx.db.query("tools").withIndex("by_category", (q) => q.eq("category", args.category!)).order("desc").collect()
      : await ctx.db.query("tools").order("desc").collect();
    return Promise.all(tools.map((tool) => toolView(ctx, tool)));
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const tools = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", viewer._id)).order("desc").collect();
    return Promise.all(tools.map((tool) => toolView(ctx, tool)));
  },
});

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const fields = validateFields(args);
    return ctx.db.insert("tools", { ...args, ...fields, ownerId: viewer._id, createdAt: Date.now() });
  },
});

export const update = mutation({
  args: { id: v.id("tools"), ...toolFields },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const tool = await ctx.db.get(args.id);
    if (!tool) throw new ConvexError("This listing no longer exists.");
    if (tool.ownerId !== viewer._id) throw new ConvexError("You can edit only your own listings.");
    const fields = validateFields(args);
    await ctx.db.patch(tool._id, { ...fields, category: args.category, condition: args.condition });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("tools") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const tool = await ctx.db.get(args.id);
    if (!tool) throw new ConvexError("This listing no longer exists.");
    if (tool.ownerId !== viewer._id && viewer.role !== "admin") throw new ConvexError("You can remove only your own listings.");
    // Loan history remains available to its participants after moderation/removal.
    await ctx.db.delete(tool._id);
    return null;
  },
});
