import type { Priority, TriagedRequest } from "@triage/shared";

export const priorityClass: Record<Priority, string> = { Urgent: "urgent", High: "high", Medium: "medium", Low: "low" };
export const priorityIcon: Record<Priority, string> = { Urgent: "!", High: "↑", Medium: "•", Low: "↓" };

export function relativeTime(value: string): string {
  const diff = new Date(value).getTime() - Date.now();
  const minutes = Math.round(Math.abs(diff) / 60000);
  if (minutes < 1) return "now";
  const label = minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
  return diff < 0 ? `${label} overdue` : `in ${label}`;
}

export function formatDate(value: string): string { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
export function channelLabel(value: string): string { return value === "web_form" ? "Web form" : value === "email" ? "Email" : "Chat"; }
export function countByPriority(items: TriagedRequest[], priority: Priority): number { return items.filter((item) => item.final.priority === priority).length; }
