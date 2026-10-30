export const CATEGORIES = [
  "power tools",
  "garden",
  "kitchen",
  "camping",
  "hand tools",
  "cleaning",
  "other",
] as const;

export const CONDITIONS = ["like new", "good", "fair"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Condition = (typeof CONDITIONS)[number];
