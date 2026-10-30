"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useServicesConfigured } from "@/components/ConvexClientProvider";
import {
  EmptyState,
  LoadingState,
  SetupNotice,
  SignInAction,
} from "@/components/Shared";
import ToolCard from "@/components/ToolCard";
import type { PublicTool } from "@/components/types";

function PublicBoard() {
  const tools = useQuery(api.tools.listPublic, {}) as PublicTool[] | undefined;
  if (tools === undefined)
    return <LoadingState label="Looking around the neighborhood…" />;
  if (tools.length === 0)
    return (
      <EmptyState
        title="Be the first to share something useful"
        description="Your neighborhood board is ready. Sign in and give a tool a life beyond the shelf."
        action={<SignInAction />}
      />
    );
  return (
    <div className="tool-grid public-grid">
      {tools.map((tool) => (
        <ToolCard key={tool._id} tool={tool} />
      ))}
    </div>
  );
}

export default function Home() {
  const configured = useServicesConfigured();
  return (
    <>
      <section className="hero page-shell">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="small-dot" /> A neighborhood worth sharing
          </p>
          <h1>
            Borrow what you need.
            <br />
            <span>Lend what you don&apos;t.</span>
          </h1>
          <p className="hero-description">
            The right tool might be just around the corner. Make room for a
            little more sharing, and a lot more doing.
          </p>
          <div className="hero-actions">
            <SignInAction />
            <a className="text-link" href="#tool-board">
              See what&apos;s available <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="hero-note">
            <span aria-hidden="true">↔</span> Built for neighbors. Made for
            everyday projects.
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-cross cross-one">+</div>
          <div className="art-cross cross-two">+</div>
          <div className="art-tool tool-a">⚒</div>
          <div className="art-center">
            lend<span>↗</span>loop
          </div>
          <div className="art-tool tool-b">♧</div>
          <span className="art-caption">A good thing, passed around.</span>
        </div>
      </section>
      <section className="how-strip">
        <div className="page-shell how-inner">
          <div>
            <span className="step-number">01</span>
            <p>
              <strong>Find your next project partner</strong>
              <span>Browse useful tools nearby.</span>
            </p>
          </div>
          <div>
            <span className="step-number">02</span>
            <p>
              <strong>Pick your dates</strong>
              <span>Send a request to the lender.</span>
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <p>
              <strong>Use it. Return it. Repeat.</strong>
              <span>Keep the good things going.</span>
            </p>
          </div>
        </div>
      </section>
      <section className="page-shell board-section" id="tool-board">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The neighborhood shelf</p>
            <h2>Useful things, ready for a new project.</h2>
          </div>
          <Link className="text-link" href="/tools">
            Explore the tool board <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <p className="board-description">
          Available tools at a glance. Sign in for details and to request your
          dates.
        </p>
        {configured ? (
          <PublicBoard />
        ) : (
          <>
            <SetupNotice />
            <EmptyState
              title="A shared shelf starts with one tool"
              description="Once Clerk and Convex are connected, available tools will appear here."
            />
          </>
        )}
      </section>
      <section className="community-callout page-shell">
        <div>
          <p className="eyebrow">Have something gathering dust?</p>
          <h2>
            Let it do some good
            <br />
            around the neighborhood.
          </h2>
          <p>List a tool, meet a need, make a neighbor&apos;s day.</p>
        </div>
        <Link href="/tools/new" className="button button-primary">
          Share your first tool <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </>
  );
}
