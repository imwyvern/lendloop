"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import ActivityBadge from "./ActivityBadge";
import { displayDate, errorMessage } from "./Shared";
import type { Loan } from "./types";

export default function LoanRow({
  loan,
  perspective,
}: {
  loan: Loan;
  perspective: "borrower" | "owner" | "admin";
}) {
  const decide = useMutation(api.loans.decide);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const overdue =
    loan.status === "approved" &&
    loan.endDate < new Date().toISOString().slice(0, 10);

  async function act(action: "approve" | "decline" | "cancel" | "return") {
    setBusy(true);
    setError("");
    try {
      if (action === "approve" || action === "decline")
        await decide({ id: loan._id, decision: action });
      else if (action === "cancel") await cancel({ id: loan._id });
      else await markReturned({ id: loan._id });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="loan-row">
      <div className="loan-main">
        <div className="loan-title">
          <h3>{loan.toolName}</h3>
          <span className={`status-pill status-${loan.status}`}>
            {loan.status}
          </span>
          {overdue && (
            <span className="status-pill status-overdue">Overdue</span>
          )}
        </div>
        <p className="loan-dates">
          {displayDate(loan.startDate)} <span aria-hidden="true">→</span>{" "}
          {displayDate(loan.endDate)}
        </p>
        <p className="loan-people">
          {perspective === "borrower"
            ? `Lender: ${loan.ownerName}`
            : perspective === "owner"
              ? `Borrower: ${loan.borrowerName}`
              : `${loan.borrowerName} borrowing from ${loan.ownerName}`}
        </p>
        <ActivityBadge activity={loan.latestActivity} />
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="loan-actions">
        {perspective === "owner" && loan.status === "requested" && (
          <>
            <button
              className="button button-primary button-small"
              disabled={busy}
              onClick={() => void act("approve")}
            >
              {busy ? "Saving…" : "Approve"}
            </button>
            <button
              className="button button-secondary button-small"
              disabled={busy}
              onClick={() => void act("decline")}
            >
              Decline
            </button>
          </>
        )}
        {perspective === "borrower" && loan.status === "requested" && (
          <button
            className="button button-secondary button-small"
            disabled={busy}
            onClick={() => void act("cancel")}
          >
            {busy ? "Cancelling…" : "Cancel request"}
          </button>
        )}
        {perspective !== "admin" && loan.status === "approved" && (
          <button
            className="button button-secondary button-small"
            disabled={busy}
            onClick={() => void act("return")}
          >
            {busy ? "Saving…" : "Mark returned"}
          </button>
        )}
      </div>
    </article>
  );
}
