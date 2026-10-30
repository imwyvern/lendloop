"use client";

import type { AutomationActivity } from "./types";

function relativeTime(timestamp: number) {
  const days = Math.floor(Math.max(0, Date.now() - timestamp) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function ActivityBadge({
  activity,
}: {
  activity: AutomationActivity | null;
}) {
  if (!activity)
    return <span className="activity-badge">Notification pending</span>;
  return (
    <span
      className={`activity-badge ${activity.status === "failed" ? "activity-failed" : ""}`}
      title={new Date(activity.createdAt).toISOString()}
    >
      <span aria-hidden="true">{activity.status === "failed" ? "!" : "↗"}</span>{" "}
      {activity.kind === "overdue_reminder" ? "Reminder" : "Notification"}{" "}
      {activity.status} {relativeTime(activity.createdAt)}
    </span>
  );
}
