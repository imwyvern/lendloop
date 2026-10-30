"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import LoanRow from "./LoanRow";
import { EmptyState, LoadingState } from "./Shared";
import type { Loan } from "./types";

export default function LoanList({
  perspective,
}: {
  perspective: "borrower" | "owner" | "admin";
}) {
  const loans = useQuery(
    perspective === "borrower"
      ? api.loans.myRequests
      : perspective === "owner"
        ? api.loans.incoming
        : api.admin.allLoans,
    {},
  ) as Loan[] | undefined;
  const [status, setStatus] = useState("all");
  if (loans === undefined) return <LoadingState label="Loading requests…" />;
  const filtered =
    status === "all" ? loans : loans.filter((loan) => loan.status === status);
  return (
    <>
      <div className="list-toolbar">
        <p className="result-count">
          {loans.length} {loans.length === 1 ? "request" : "requests"}
        </p>
        <label className="inline-select">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            {["requested", "approved", "declined", "returned", "cancelled"].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={
            status === "all"
              ? perspective === "owner"
                ? "No incoming requests yet"
                : perspective === "admin"
                  ? "No community loans yet"
                  : "Nothing borrowed. Yet."
              : "No requests with this status"
          }
          description={
            status !== "all"
              ? "Choose a different status to see more requests."
              : perspective === "owner"
                ? "When a neighbor requests one of your tools, you can approve or decline it here."
                : perspective === "admin"
                  ? "Loans across the neighborhood will appear here, along with their status and automation activity."
                  : "A project starts with the right tool. Find something useful in the neighborhood."
          }
          action={
            perspective === "borrower" && status === "all" ? (
              <Link href="/tools" className="button button-primary">
                Explore the tool board <span aria-hidden="true">↗</span>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="loan-list">
          {filtered.map((loan) => (
            <LoanRow key={loan._id} loan={loan} perspective={perspective} />
          ))}
        </div>
      )}
    </>
  );
}
