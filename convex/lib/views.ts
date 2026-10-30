import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { todayUTC } from "./dates";

export type ToolView = Doc<"tools"> & {
  availability: "available" | "on loan";
  ownerName: string;
  ownerTrusted: boolean;
};

export type LoanView = Doc<"loans"> & {
  toolName: string;
  ownerName: string;
  borrowerName: string;
  latestActivity: Pick<Doc<"automationEvents">, "kind" | "status" | "createdAt"> | null;
};

export async function toolView(ctx: QueryCtx, tool: Doc<"tools">): Promise<ToolView> {
  const [owner, loans] = await Promise.all([
    ctx.db.get(tool.ownerId),
    ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", tool._id)).collect(),
  ]);
  const today = todayUTC();
  const onLoan = loans.some((loan) => loan.status === "approved" && loan.startDate <= today && loan.endDate >= today);
  return { ...tool, availability: onLoan ? "on loan" : "available", ownerName: owner?.name ?? "Neighbor", ownerTrusted: owner?.trusted ?? false };
}

export async function loanView(ctx: QueryCtx, loan: Doc<"loans">): Promise<LoanView> {
  const [tool, owner, borrower, event] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.ownerId),
    ctx.db.get(loan.borrowerId),
    ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loan._id)).order("desc").first(),
  ]);
  return {
    ...loan,
    toolName: tool?.name ?? "Removed listing",
    ownerName: owner?.name ?? "Neighbor",
    borrowerName: borrower?.name ?? "Neighbor",
    latestActivity: event ? { kind: event.kind, status: event.status, createdAt: event.createdAt } : null,
  };
}
