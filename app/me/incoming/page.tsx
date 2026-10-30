"use client";

import LoanList from "@/components/LoanList";
import { Authenticated, PageHeading } from "@/components/Shared";

export default function IncomingPage() {
  return (
    <Authenticated>
      {() => (
        <section className="page-shell">
          <PageHeading
            eyebrow="Lend a hand"
            title="Incoming requests"
            description="A neighbor has something in mind. Help their next project along."
          />
          <LoanList perspective="owner" />
        </section>
      )}
    </Authenticated>
  );
}
