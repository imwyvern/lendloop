"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const configured = Boolean(
  convexUrl &&
  /^https?:\/\//.test(convexUrl) &&
  clerkKey &&
  /^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(clerkKey),
);
const convex =
  configured && convexUrl ? new ConvexReactClient(convexUrl) : null;
const ServiceContext = createContext(false);

export function useServicesConfigured() {
  return useContext(ServiceContext);
}

function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensure = useMutation(api.users.ensure);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    void ensure({})
      .then(() => {
        if (active) setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [ensure, isAuthenticated, attempt]);

  if (!error || !isAuthenticated) return null;
  return (
    <div className="account-alert" role="alert">
      Your account could not be synced. Check the Clerk JWT template and Convex
      configuration.
      <button
        className="text-button"
        onClick={() => setAttempt((value) => value + 1)}
      >
        Try again
      </button>
    </div>
  );
}

export default function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!configured || !convex || !clerkKey) {
    return (
      <ServiceContext.Provider value={false}>
        {children}
      </ServiceContext.Provider>
    );
  }
  return (
    <ServiceContext.Provider value={true}>
      <ClerkProvider publishableKey={clerkKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <EnsureUser />
          {children}
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </ServiceContext.Provider>
  );
}
