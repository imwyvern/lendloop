"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import ListingCard from "@/components/ListingCard";
import {
  Authenticated,
  EmptyState,
  LoadingState,
  PageHeading,
} from "@/components/Shared";
import type { Tool } from "@/components/types";

function MyListings() {
  const tools = useQuery(api.tools.mine, {}) as Tool[] | undefined;
  return (
    <section className="page-shell">
      <PageHeading
        eyebrow="Your corner of the neighborhood"
        title="My listings"
        description="Good tools deserve more than a spot on the shelf."
        action={
          <Link href="/tools/new" className="button button-primary">
            + List a tool
          </Link>
        }
      />
      {tools === undefined ? (
        <LoadingState label="Opening your tool shed…" />
      ) : tools.length === 0 ? (
        <EmptyState
          title="What's in your tool shed?"
          description="Share something useful. Your first listing could make a neighbor's next project possible."
          action={
            <Link href="/tools/new" className="button button-primary">
              List your first tool <span aria-hidden="true">↗</span>
            </Link>
          }
        />
      ) : (
        <>
          <p className="result-count listings-count">
            {tools.length} {tools.length === 1 ? "tool" : "tools"} shared
          </p>
          <div className="tool-grid">
            {tools.map((tool) => (
              <ListingCard key={tool._id} tool={tool} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function MyListingsPage() {
  return <Authenticated>{() => <MyListings />}</Authenticated>;
}
