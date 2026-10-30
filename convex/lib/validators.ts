import { v } from "convex/values";

export const category = v.union(
  v.literal("power tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("hand tools"),
  v.literal("cleaning"),
  v.literal("other"),
);
export const condition = v.union(v.literal("like new"), v.literal("good"), v.literal("fair"));
export const loanStatus = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);
export const eventKind = v.union(v.literal("notification"), v.literal("overdue_reminder"));
export const eventStatus = v.union(v.literal("sent"), v.literal("failed"));
export const notificationType = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);
