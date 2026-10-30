"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import BorrowForm from "@/components/BorrowForm";
import CategoryFilter from "@/components/CategoryFilter";
import ToolCard from "@/components/ToolCard";
import {
  Authenticated,
  EmptyState,
  LoadingState,
  PageHeading,
} from "@/components/Shared";
import type { Tool, Viewer } from "@/components/types";
import type { Category } from "@/lib/categories";

function ToolsBrowser({ viewer }: { viewer: Viewer }) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [availability, setAvailability] = useState("all");
  const [requesting, setRequesting] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const tools = useQuery(
    api.tools.listAll,
    category === "all" ? {} : { category },
  ) as Tool[] | undefined;
  const visible = tools?.filter(
    (tool) => availability === "all" || tool.availability === availability,
  );
  return (
    <section className="page-shell">
      <PageHeading
        eyebrow="Make something happen"
        title="The tool board"
        description="For the weekend project, the quick fix, and everything in between."
        action={
          <Link href="/tools/new" className="button button-primary">
            + List a tool
          </Link>
        }
      />
      <CategoryFilter value={category} onChange={setCategory} />
      <div className="list-toolbar">
        <p className="result-count">
          {visible
            ? `${visible.length} ${visible.length === 1 ? "tool" : "tools"} to discover`
            : "Finding tools…"}
        </p>
        <label className="inline-select">
          Availability
          <select
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          >
            <option value="all">All tools</option>
            <option value="available">Available today</option>
            <option value="on loan">On loan today</option>
          </select>
        </label>
      </div>
      {success && (
        <p className="success-notice" role="status">
          Request sent for {success}.{" "}
          <Link href="/me/requests">Track it in My requests ↗</Link>
        </p>
      )}
      {!tools ? (
        <LoadingState />
      ) : visible?.length === 0 ? (
        <EmptyState
          title="A little room on the shelf"
          description="No tools match these filters. Try another category, or be the first to share one."
          action={
            <Link href="/tools/new" className="button button-primary">
              List a tool
            </Link>
          }
        />
      ) : (
        <div className="tool-grid">
          {visible?.map((tool) => (
            <ToolCard key={tool._id} tool={tool}>
              {tool.ownerId === viewer._id ? (
                <Link
                  className="button button-secondary full-width"
                  href={`/tools/${tool._id}/edit`}
                >
                  Edit your listing
                </Link>
              ) : requesting === tool._id ? (
                <BorrowForm
                  tool={tool}
                  onClose={() => setRequesting(null)}
                  onSuccess={() => {
                    setRequesting(null);
                    setSuccess(tool.name);
                  }}
                />
              ) : (
                <button
                  className="button button-secondary full-width"
                  onClick={() => {
                    setRequesting(tool._id);
                    setSuccess("");
                  }}
                >
                  Request to borrow <span aria-hidden="true">↗</span>
                </button>
              )}
            </ToolCard>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ToolsPage() {
  return (
    <Authenticated>
      {(viewer) => <ToolsBrowser viewer={viewer} />}
    </Authenticated>
  );
}
