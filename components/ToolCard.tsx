"use client";

import type { ReactNode } from "react";
import type { PublicTool, Tool } from "./types";

const categoryIcons: Record<string, string> = {
  "power tools": "⚒",
  garden: "♧",
  kitchen: "◒",
  camping: "△",
  "hand tools": "⌁",
  cleaning: "✧",
  other: "◇",
};

export default function ToolCard({
  tool,
  children,
}: {
  tool: PublicTool | Tool;
  children?: ReactNode;
}) {
  const privateTool = "ownerName" in tool ? tool : null;
  return (
    <article className="tool-card">
      <div className="tool-card-top">
        <span className="tool-icon" aria-hidden="true">
          {categoryIcons[tool.category] ?? "◇"}
        </span>
        {privateTool && (
          <span
            className={`status-pill ${privateTool.availability === "available" ? "status-available" : "status-neutral"}`}
          >
            <span className="status-dot" />
            {privateTool.availability === "available" ? "Available" : "On loan"}
          </span>
        )}
      </div>
      <div className="tool-card-content">
        <p className="category-label">{tool.category}</p>
        <h3>{tool.name}</h3>
        {privateTool && (
          <>
            <p className="tool-description">{privateTool.description}</p>
            <div className="tool-meta">
              <span className="condition-label">{privateTool.condition}</span>
              <span className="tool-owner">
                {privateTool.ownerName}
                {privateTool.ownerTrusted && (
                  <span
                    className="trusted-badge"
                    title="Trusted Lender"
                    aria-label="Trusted Lender"
                  >
                    ✓
                  </span>
                )}
              </span>
            </div>
          </>
        )}
      </div>
      {children && <div className="tool-card-actions">{children}</div>}
    </article>
  );
}
