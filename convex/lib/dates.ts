import { ConvexError } from "convex/values";

const DAY_MS = 86_400_000;

// Calendar dates use UTC throughout the app and the daily automation.
export function todayUTC(): string {
  return new Date(Date.now()).toISOString().slice(0, 10);
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function validateLoanDates(startDate: string, endDate: string): void {
  if (!validDate(startDate) || !validDate(endDate)) {
    throw new ConvexError("Use valid dates in YYYY-MM-DD format.");
  }
  if (startDate < todayUTC()) throw new ConvexError("The start date must be today or later.");
  if (endDate < startDate) throw new ConvexError("The end date must be on or after the start date.");
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS + 1;
  if (days > 30) throw new ConvexError("Loans can be at most 30 days, including both dates.");
}

// Both boundary dates are included; a return date is still a borrowed day.
export function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && startB <= endA;
}
