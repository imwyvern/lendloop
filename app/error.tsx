"use client";

import { EmptyState } from "@/components/Shared";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="page-shell">
      <EmptyState
        title="The board couldn't load"
        description="Check your connection and service configuration, then give it another try."
        action={
          <button className="button button-primary" onClick={reset}>
            Try again
          </button>
        }
      />
    </section>
  );
}
