"use client";

import LoanList from "@/components/LoanList";
import { Authenticated, PageHeading } from "@/components/Shared";

export default function MyRequestsPage() {
  return (
    <Authenticated>
      {() => (
        <section className="page-shell">
          <PageHeading
            eyebrow="A project in the making"
            title="My requests"
            description="Keep an eye on your borrow requests, dates, and returns."
          />
          <LoanList perspective="borrower" />
        </section>
      )}
    </Authenticated>
  );
}
