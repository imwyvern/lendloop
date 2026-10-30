// Minimal conventional generated API; regenerate with `npx convex dev`.
import { anyApi } from "convex/server";
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as admin from "../admin";
import type * as automation from "../automation";
import type * as loans from "../loans";
import type * as tools from "../tools";
import type * as users from "../users";

const fullApi = anyApi as unknown as ApiFromModules<{
  admin: typeof admin;
  automation: typeof automation;
  loans: typeof loans;
  tools: typeof tools;
  users: typeof users;
}>;
export const api = fullApi as FilterApi<typeof fullApi, FunctionReference<"query" | "mutation" | "action", "public">>;
export const internal = fullApi as FilterApi<typeof fullApi, FunctionReference<"query" | "mutation" | "action", "internal">>;
