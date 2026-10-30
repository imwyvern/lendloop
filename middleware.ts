import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/tools/new(.*)",
  "/tools/(.*)/edit(.*)",
  "/me(.*)",
  "/admin(.*)",
]);
const configured = Boolean(
  process.env.CLERK_SECRET_KEY &&
  /^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  ),
);

export default configured
  ? clerkMiddleware(async (auth, request) => {
      if (isProtectedRoute(request)) await auth.protect();
    })
  : function setupMiddleware() {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
