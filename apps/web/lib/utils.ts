import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RiskLevel, Role } from "@procureflow/shared";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  SUBMITTED: "bg-sky-50 text-sky-700 ring-sky-200",
  IN_APPROVAL: "bg-amber-50 text-amber-800 ring-amber-200",
  CHANGES_REQUESTED: "bg-orange-50 text-orange-700 ring-orange-200",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
  PO_ISSUED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-200",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  ESCALATED: "bg-orange-50 text-orange-800 ring-orange-200",
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-200",
  SYNCED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ISSUED: "bg-sky-50 text-sky-700 ring-sky-200",
  PENDING_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
  APPROVED_VENDOR: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  BLOCKED: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-800 ring-amber-200",
  HIGH: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const ROLE_STYLES: Record<Role, string> = {
  REQUESTER: "bg-slate-100 text-slate-700 ring-slate-200",
  APPROVER: "bg-brand-50 text-brand-700 ring-brand-200",
  FINANCE: "bg-sky-50 text-sky-700 ring-sky-200",
  ADMIN: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 ring-slate-200";
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function listToCsv(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}

export function safeJsonPreview(value: unknown, max = 160): string {
  const text = JSON.stringify(value ?? {});
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
