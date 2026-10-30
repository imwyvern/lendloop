"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "./Shared";
import type { Tool } from "./types";

export default function BorrowForm({
  tool,
  onClose,
  onSuccess,
}: {
  tool: Tool;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const request = useMutation(api.loans.request);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const maximumEnd = new Date(`${startDate}T12:00:00Z`);
  maximumEnd.setUTCDate(maximumEnd.getUTCDate() + 29);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request({ toolId: tool._id, startDate, endDate });
      onSuccess();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="borrow-form" onSubmit={(event) => void submit(event)}>
      <p className="form-subtitle">
        Choose your dates <span>· Up to 30 days</span>
      </p>
      <div className="date-fields">
        <label>
          From
          <input
            type="date"
            required
            min={today}
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              if (endDate < event.target.value) setEndDate(event.target.value);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            required
            min={startDate || today}
            max={
              Number.isNaN(maximumEnd.getTime())
                ? undefined
                : maximumEnd.toISOString().slice(0, 10)
            }
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
      </div>
      <p className="form-hint">
        The lender will confirm availability for these dates.
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button button-primary button-small" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
        <button
          className="text-button"
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
