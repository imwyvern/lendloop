"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "./Shared";
import ToolCard from "./ToolCard";
import type { Tool } from "./types";

export default function ListingCard({
  tool,
  admin = false,
}: {
  tool: Tool;
  admin?: boolean;
}) {
  const remove = useMutation(api.tools.remove);
  const setTrusted = useMutation(api.admin.setTrusted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function removeListing() {
    if (!window.confirm(`Remove “${tool.name}” from the tool board?`)) return;
    setBusy(true);
    setError("");
    try {
      await remove({ id: tool._id });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function toggleTrusted() {
    setBusy(true);
    setError("");
    try {
      await setTrusted({ userId: tool.ownerId, trusted: !tool.ownerTrusted });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ToolCard tool={tool}>
      <div className="listing-actions">
        {admin ? (
          <button
            className="button button-secondary button-small"
            disabled={busy}
            onClick={() => void toggleTrusted()}
          >
            {tool.ownerTrusted
              ? "Remove trusted status"
              : "Mark Trusted Lender"}
          </button>
        ) : (
          <Link
            className="button button-secondary button-small"
            href={`/tools/${tool._id}/edit`}
          >
            Edit listing
          </Link>
        )}
        <button
          className="text-button danger-text"
          disabled={busy}
          onClick={() => void removeListing()}
        >
          {busy ? "Saving…" : "Remove"}
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </ToolCard>
  );
}
