import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { category, condition, eventKind, eventStatus, loanStatus } from "./lib/validators";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    trusted: v.boolean(),
  }).index("by_clerkId", ["clerkId"]),
  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]).index("by_category", ["category"]),
  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    returnedAt: v.optional(v.number()),
  }).index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"]),
  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: eventKind,
    status: eventStatus,
    idempotencyKey: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),
});
