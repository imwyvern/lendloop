"use client";

import { Show, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useServicesConfigured } from "./ConvexClientProvider";
import { SignInAction } from "./Shared";
import type { Viewer } from "./types";

const links = [
  { href: "/tools", label: "Browse tools" },
  { href: "/me/listings", label: "My listings" },
  { href: "/me/requests", label: "My requests" },
  { href: "/me/incoming", label: "Incoming" },
];

function Account() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip") as
    Viewer | null | undefined;
  return (
    <>
      <Show when="signed-in">
        {viewer?.role === "admin" && (
          <Link href="/admin" className="admin-link">
            Admin
          </Link>
        )}
        <Link href="/tools/new" className="button button-primary button-small">
          + List a tool
        </Link>
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInAction
          label="Sign in"
          className="button button-secondary button-small"
        />
      </Show>
    </>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const configured = useServicesConfigured();
  return (
    <header className="site-header">
      <div className="nav-main">
        <Link href="/" className="brand" aria-label="LendLoop home">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          LendLoop<span className="brand-period">.</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={pathname === href ? "nav-link active" : "nav-link"}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-account">
          {configured ? (
            <Account />
          ) : (
            <SignInAction
              label="Sign in"
              className="button button-secondary button-small"
            />
          )}
        </div>
      </div>
    </header>
  );
}
