import type { Id } from "@/convex/_generated/dataModel";
import type { Category, Condition } from "@/lib/categories";

export type Viewer = {
  _id: Id<"users">;
  name: string;
  role: "user" | "admin";
  trusted: boolean;
};

export type PublicTool = {
  _id: Id<"tools">;
  name: string;
  category: Category;
};

export type Tool = PublicTool & {
  ownerId: Id<"users">;
  condition: Condition;
  description: string;
  availability: "available" | "on loan";
  ownerName: string;
  ownerTrusted: boolean;
};

export type AutomationActivity = {
  kind: "notification" | "overdue_reminder";
  status: "sent" | "failed";
  createdAt: number;
};

export type Loan = {
  _id: Id<"loans">;
  toolId: Id<"tools">;
  ownerId: Id<"users">;
  borrowerId: Id<"users">;
  startDate: string;
  endDate: string;
  status: "requested" | "approved" | "declined" | "returned" | "cancelled";
  toolName: string;
  ownerName: string;
  borrowerName: string;
  latestActivity: AutomationActivity | null;
};
