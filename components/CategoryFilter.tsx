"use client";

import { CATEGORIES, type Category } from "@/lib/categories";

export default function CategoryFilter({
  value,
  onChange,
}: {
  value: Category | "all";
  onChange: (value: Category | "all") => void;
}) {
  return (
    <div
      className="category-filter"
      role="group"
      aria-label="Filter by category"
    >
      <button
        className={value === "all" ? "filter-chip selected" : "filter-chip"}
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        All tools
      </button>
      {CATEGORIES.map((category) => (
        <button
          key={category}
          className={
            value === category ? "filter-chip selected" : "filter-chip"
          }
          aria-pressed={value === category}
          onClick={() => onChange(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
