"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import ListingCard from "@/components/ListingCard";
import LoanList from "@/components/LoanList";
import {
  Authenticated,
  EmptyState,
  LoadingState,
  PageHeading,
} from "@/components/Shared";
import type { Tool } from "@/components/types";

function AdminTools() {
  const tools = useQuery(api.tools.listAll, {}) as Tool[] | undefined;
  if (tools === undefined)
    return <LoadingState label="Loading community listings…" />;
  if (tools.length === 0)
    return (
      <EmptyState
        title="The board is ready for its first listing"
        description="Community listings and lender trust controls will appear here."
      />
    );
  return (
    <div className="tool-grid">
      {tools.map((tool) => (
        <ListingCard key={tool._id} tool={tool} admin />
      ))}
    </div>
  );
}

function AdminBoard() {
  const [tab, setTab] = useState("loans");
  return (
    <section className="page-shell">
      <PageHeading
        eyebrow="Keep the loop running"
        title="Community administration"
        description="Review all loans, moderate listings, and recognize trusted lenders."
      />
      <div className="admin-tabs" role="group" aria-label="Administration view">
        <button
          className={tab === "loans" ? "filter-chip selected" : "filter-chip"}
          aria-pressed={tab === "loans"}
          onClick={() => setTab("loans")}
        >
          All loans
        </button>
        <button
          className={
            tab === "listings" ? "filter-chip selected" : "filter-chip"
          }
          aria-pressed={tab === "listings"}
          onClick={() => setTab("listings")}
        >
          Listings & lenders
        </button>
      </div>
      {tab === "loans" ? <LoanList perspective="admin" /> : <AdminTools />}
    </section>
  );
}

export default function AdminPage() {
  return <Authenticated admin>{() => <AdminBoard />}</Authenticated>;
}
