"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  Authenticated,
  EmptyState,
  LoadingState,
  PageHeading,
} from "@/components/Shared";
import ToolForm from "@/components/ToolForm";
import type { Tool } from "@/components/types";

function EditListing({ id }: { id: string }) {
  const tools = useQuery(api.tools.mine, {}) as Tool[] | undefined;
  if (tools === undefined)
    return <LoadingState label="Loading your listing…" />;
  const tool = tools.find((item) => item._id === id);
  if (!tool)
    return (
      <EmptyState
        title="This listing isn't in your tool shed"
        description="It may have been removed, or belong to another lender. You can edit listings you own."
        action={
          <Link href="/me/listings" className="button button-primary">
            Back to my listings
          </Link>
        }
      />
    );
  return (
    <>
      <PageHeading
        eyebrow="Keep the shelf up to date"
        title="Edit your listing"
        description="A little detail helps neighbors find the right tool."
      />
      <ToolForm tool={tool} />
    </>
  );
}

export default function EditToolPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Authenticated>
      {() => (
        <section className="page-shell narrow-shell">
          <EditListing id={id} />
        </section>
      )}
    </Authenticated>
  );
}
