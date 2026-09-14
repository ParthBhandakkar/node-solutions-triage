import type { Priority, Sla } from "@triage/shared";
import org from "../../config/org.json" with { type: "json" };

type SlaConfig = { acknowledge_minutes: number; resolve_hours: number | null; internal_action: string };
const config = org.sla as Record<Priority, SlaConfig>;

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function nextBusinessStart(date: Date): Date {
  const result = new Date(date);
  result.setHours(org.business_hours.start, 0, 0, 0);
  while (!isBusinessDay(result)) result.setDate(result.getDate() + 1);
  return result;
}

function addBusinessMinutes(start: Date, minutes: number): Date {
  let cursor = new Date(start);
  let remaining = minutes;
  while (remaining > 0) {
    if (!isBusinessDay(cursor) || cursor.getHours() < org.business_hours.start || cursor.getHours() >= org.business_hours.end) {
      if (!isBusinessDay(cursor) || cursor.getHours() >= org.business_hours.end) cursor.setDate(cursor.getDate() + 1);
      cursor = nextBusinessStart(cursor);
    }
    const endOfDay = new Date(cursor);
    endOfDay.setHours(org.business_hours.end, 0, 0, 0);
    const available = Math.max(0, Math.floor((endOfDay.getTime() - cursor.getTime()) / 60000));
    if (available >= remaining) { cursor = new Date(cursor.getTime() + remaining * 60000); remaining = 0; }
    else { remaining -= available; cursor = new Date(endOfDay.getTime() + 60000); }
  }
  return cursor;
}

export function calculateSla(priority: Priority, receivedAt = new Date()): Sla {
  const item = config[priority];
  const acknowledge = priority === "Urgent" ? new Date(receivedAt.getTime() + item.acknowledge_minutes * 60000) : addBusinessMinutes(receivedAt, item.acknowledge_minutes);
  const resolve = item.resolve_hours === null ? null : priority === "Urgent" ? new Date(receivedAt.getTime() + item.resolve_hours * 3600000) : addBusinessMinutes(receivedAt, item.resolve_hours * 60);
  return {
    acknowledge_by: acknowledge.toISOString(),
    resolve_by: resolve?.toISOString() ?? "Backlog / next planning cycle",
    internal_action: item.internal_action
  };
}

export function getAcknowledgementWindow(priority: Priority): string {
  const minutes = config[priority].acknowledge_minutes;
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return "1 business hour";
  if (minutes % 60 === 0 && minutes < 1440) return `${minutes / 60} business hours`;
  return "1 business day";
}

export function getSlaConfig(): typeof org.sla { return org.sla; }
export function getOrgConfig(): typeof org { return org; }
