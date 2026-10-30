import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer } from "./lib/auth";

export const viewer = query({ args: {}, handler: (ctx) => getViewer(ctx) });

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to continue.");
    const email = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Your sign-in token needs an email claim. Check the Clerk convex JWT template.");
    }
    const name = (typeof identity.name === "string" ? identity.name.trim() : "").slice(0, 100) || "Neighbor";
    const existing = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject)).unique();
    if (existing) {
      // Never re-bootstrap roles on subsequent sign-ins or profile/email changes.
      await ctx.db.patch(existing._id, { name, email });
      return { ...existing, name, email };
    }
    const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    // A listed but unverified address must never bootstrap an administrator.
    const role = identity.emailVerified === true && adminEmails.includes(email) ? "admin" as const : "user" as const;
    const id = await ctx.db.insert("users", { clerkId: identity.subject, name, email, role, trusted: false });
    return (await ctx.db.get(id))!;
  },
});
