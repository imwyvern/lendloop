"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useServicesConfigured } from "./ConvexClientProvider";
import type { Viewer } from "./types";

export function SetupNotice() {
  return (
    <div className="notice" role="status">
      <span className="notice-dot" />
      <div>
        <strong>Connect your neighborhood</strong>
        <p>
          Set up Clerk and Convex to load live tools and start lending. Follow
          the quick start in the README.
        </p>
      </div>
    </div>
  );
}

export function SignInAction({
  label = "Sign in to lend or borrow",
  className = "button button-primary",
}: {
  label?: string;
  className?: string;
}) {
  const configured = useServicesConfigured();
  if (!configured)
    return (
      <button
        className={className}
        disabled
        title="Configure Clerk and Convex first"
      >
        {label}
      </button>
    );
  return <LiveSignInAction label={label} className={className} />;
}

function LiveSignInAction({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  const { isSignedIn } = useAuth();
  if (isSignedIn)
    return (
      <Link href="/tools" className={className}>
        Browse tools <span aria-hidden="true">↗</span>
      </Link>
    );
  return (
    <SignInButton mode="modal">
      <button className={className}>{label}</button>
    </SignInButton>
  );
}

export function LoadingState({
  label = "Loading your neighborhood…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        ↗
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Authenticated({
  children,
  admin = false,
}: {
  children: (viewer: Viewer) => ReactNode;
  admin?: boolean;
}) {
  const configured = useServicesConfigured();
  if (!configured)
    return (
      <section className="page-shell">
        <SetupNotice />
        <EmptyState
          title="Your lending board is almost ready"
          description="Connect the services in your environment to use your account and see live listings."
          action={
            <Link className="button button-secondary" href="/">
              Back to the neighborhood
            </Link>
          }
        />
      </section>
    );
  return <LiveAuthenticated admin={admin}>{children}</LiveAuthenticated>;
}

function LiveAuthenticated({
  children,
  admin,
}: {
  children: (viewer: Viewer) => ReactNode;
  admin: boolean;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip") as
    Viewer | null | undefined;
  if (isLoading)
    return (
      <section className="page-shell">
        <LoadingState label="Checking your account…" />
      </section>
    );
  if (!isAuthenticated)
    return (
      <section className="page-shell">
        <EmptyState
          title="A little closer to your neighborhood"
          description="Sign in to browse tool details, share what you have, and borrow what you need."
          action={<SignInAction />}
        />
      </section>
    );
  if (viewer === undefined || viewer === null)
    return (
      <section className="page-shell">
        <LoadingState label="Getting your account ready…" />
      </section>
    );
  if (admin && viewer.role !== "admin")
    return (
      <section className="page-shell">
        <EmptyState
          title="This space is for administrators"
          description="Your account can manage your own listings and requests. Community moderation requires an administrator account."
          action={
            <Link href="/tools" className="button button-primary">
              Browse tools
            </Link>
          }
        />
      </section>
    );
  return <>{children(viewer)}</>;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/^\[CONVEX[^\]]*\]\s*/, "");
    const match = message.match(/(?:Uncaught )?ConvexError:\s*([^\n]+)/);
    return (
      match?.[1] ??
      message.split("\n")[0] ??
      "Something went wrong. Please try again."
    );
  }
  return "Something went wrong. Please try again.";
}

export function displayDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
