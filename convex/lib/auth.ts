import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

export async function getViewer(ctx: AuthCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject)).unique();
}

export async function requireUser(ctx: AuthCtx): Promise<Doc<"users">> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError("Sign in and finish account setup to continue.");
  return viewer;
}

export async function requireAdmin(ctx: AuthCtx): Promise<Doc<"users">> {
  const viewer = await requireUser(ctx);
  if (viewer.role !== "admin") throw new ConvexError("Administrator access required.");
  return viewer;
}
