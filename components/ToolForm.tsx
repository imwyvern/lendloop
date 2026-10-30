"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import {
  CATEGORIES,
  CONDITIONS,
  type Category,
  type Condition,
} from "@/lib/categories";
import { errorMessage } from "./Shared";
import type { Tool } from "./types";

export default function ToolForm({ tool }: { tool?: Tool }) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const router = useRouter();
  const [name, setName] = useState(tool?.name ?? "");
  const [category, setCategory] = useState<Category>(
    tool?.category ?? CATEGORIES[0],
  );
  const [condition, setCondition] = useState<Condition>(
    tool?.condition ?? "good",
  );
  const [description, setDescription] = useState(tool?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = {
        name: name.trim(),
        category,
        condition,
        description: description.trim(),
      };
      if (tool) await update({ id: tool._id, ...values });
      else await create(values);
      router.push("/me/listings");
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <form
      className="listing-form panel"
      onSubmit={(event) => void submit(event)}
    >
      <div className="form-section">
        <p className="eyebrow">The essentials</p>
        <h2>{tool ? "Update your tool" : "What can you share?"}</h2>
        <label>
          Tool name
          <input
            autoComplete="off"
            type="text"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What would a neighbor call it?"
          />
        </label>
        <div className="field-grid">
          <label>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select
              value={condition}
              onChange={(event) =>
                setCondition(event.target.value as Condition)
              }
            >
              {CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Short description <span className="optional">Optional</span>
          <textarea
            rows={5}
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Share useful details, included accessories, or anything a borrower should know."
          />
        </label>
        <p className="form-hint">
          Keep contact details out of your listing. Tool details are visible to
          signed-in neighbors; only the name and category appear publicly.
        </p>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Link className="button button-secondary" href="/me/listings">
          Cancel
        </Link>
        <button className="button button-primary" disabled={busy}>
          {busy ? "Saving…" : tool ? "Save changes" : "Publish listing"}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  );
}
