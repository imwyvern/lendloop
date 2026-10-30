"use client";

import { Authenticated, PageHeading } from "@/components/Shared";
import ToolForm from "@/components/ToolForm";

export default function NewToolPage() {
  return (
    <Authenticated>
      {() => (
        <section className="page-shell narrow-shell">
          <PageHeading
            eyebrow="Good things are better shared"
            title="Give your tool a new project."
            description="A few details are all it takes to lend a hand."
          />
          <ToolForm />
        </section>
      )}
    </Authenticated>
  );
}
