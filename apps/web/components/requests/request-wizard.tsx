"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleDollarSign,
  Loader2,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  REQUEST_CATEGORIES,
  dollarsToCents,
  formatMoney,
  type RiskLevel,
  type VendorStatus,
} from "@procureflow/shared/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { RISK_STYLES, cn, humanize } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

interface VendorOption {
  id: string;
  name: string;
  status: VendorStatus;
  riskLevel: RiskLevel;
  contactEmail: string;
  website: string | null;
}

interface ItemDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const STEPS = ["Vendor", "Request details", "Line items"] as const;
const URGENCY_COPY = {
  LOW: { label: "Low", hint: "Plan ahead; no rush" },
  NORMAL: { label: "Normal", hint: "Standard lead time" },
  HIGH: { label: "High", hint: "Needed urgently" },
} as const;

function newItem(): ItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    description: "",
    quantity: "1",
    unitPrice: "",
  };
}

function lineTotal(item: ItemDraft): number {
  const qty = Number(item.quantity);
  const price = Number(item.unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price <= 0) return 0;
  return dollarsToCents(price) * Math.floor(qty);
}

export function RequestWizard({
  vendors,
  defaultDepartment,
}: {
  vendors: VendorOption[];
  defaultDepartment: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [vendorId, setVendorId] = useState(
    vendors.find((vendor) => vendor.status === "APPROVED")?.id ?? vendors[0]?.id ?? "",
  );
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState(defaultDepartment);
  const [category, setCategory] = useState("GENERAL");
  const [urgency, setUrgency] = useState<"LOW" | "NORMAL" | "HIGH">("NORMAL");
  const [currency, setCurrency] = useState("USD");
  const [justification, setJustification] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);

  const vendor = vendors.find((entry) => entry.id === vendorId) ?? null;
  const totalCents = useMemo(
    () => items.reduce((sum, item) => sum + lineTotal(item), 0),
    [items],
  );

  const chain = useMemo(() => {
    const roles: string[] = [];
    if (totalCents <= 100_000) return ["Auto-approve", "PO issued"];
    if (totalCents <= 1_000_000) roles.push("Manager", "Finance");
    else roles.push("Manager", "Finance", "Admin / compliance");
    if (vendor?.riskLevel === "HIGH") roles.push("Compliance (high-risk vendor)");
    if (vendor && vendor.status !== "APPROVED") roles.push("Compliance (vendor onboarding)");
    return Array.from(new Set(roles));
  }, [totalCents, vendor]);

  function validateStep(current: number): string | null {
    if (current === 0 && !vendorId) return "Select a vendor to continue.";
    if (current === 1) {
      if (title.trim().length < 3) return "Give the request a clear title.";
      if (!department.trim()) return "Department is required.";
      if (justification.trim().length < 10) return "Add a short business justification.";
    }
    if (current === 2) {
      if (items.length === 0) return "Add at least one line item.";
      for (const item of items) {
        if (item.description.trim().length < 2) return "Describe every line item.";
        if (!(Number(item.quantity) >= 1)) return "Quantities must be at least 1.";
        if (!(Number(item.unitPrice) > 0)) return "Every item needs a unit price.";
      }
      if (totalCents <= 0) return "The request total must be greater than zero.";
    }
    return null;
  }

  function goNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function submit() {
    setError(null);
    for (const index of [0, 1, 2]) {
      const message = validateStep(index);
      if (message) {
        setStep(index);
        setError(message);
        return;
      }
    }
    setSubmitting(true);
    try {
      const createResponse = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          justification,
          department,
          urgency,
          category,
          vendorId,
          currency,
          items: items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
          })),
        }),
      });

      const createBody = await createResponse.json().catch(() => null);
      if (!createResponse.ok) {
        throw new Error(createBody?.error?.message ?? "Could not create the purchase request");
      }

      const id = createBody.request.id as string;
      setDraftId(id);

      const submitResponse = await fetch(`/api/requests/${id}/submit`, { method: "POST" });
      const submitBody = await submitResponse.json().catch(() => null);
      if (!submitResponse.ok) {
        throw new Error(
          submitBody?.error?.message ??
            "The draft was saved, but the approval workflow could not be started.",
        );
      }

      router.push(`/requests/${id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (vendors.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-14 text-center">
          <Building2 className="h-8 w-8 text-slate-400" />
          <p className="mt-3 font-semibold">Add a vendor first</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Purchase requests reference a vendor. Create a vendor profile, then come back to start the
            request.
          </p>
          <Link href="/vendors" className="mt-4">
            <Button>Go to vendors</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <div className="surface overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
          <ol className="flex items-center gap-2 sm:gap-3">
            {STEPS.map((label, index) => {
              const active = index === step;
              const complete = index < step;
              return (
                <li key={label} className="flex flex-1 items-center gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1",
                      active
                        ? "bg-brand-600 text-white ring-brand-600"
                        : complete
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-white text-slate-400 ring-slate-200",
                    )}
                  >
                    {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      "hidden text-xs font-medium sm:block",
                      active ? "text-slate-900" : "text-slate-500",
                    )}
                  >
                    {label}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span className="mx-1 h-px flex-1 bg-slate-200" aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="p-5 sm:p-6">
          {step === 0 ? (
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Choose a vendor</h2>
              <p className="mt-1 text-sm text-slate-500">
                Vendor risk and onboarding status can add compliance approvals automatically.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {vendors.map((option) => {
                  const selected = option.id === vendorId;
                  const blocked = option.status === "BLOCKED";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={blocked}
                      onClick={() => setVendorId(option.id)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition",
                        selected
                          ? "border-brand-400 bg-brand-50/50 ring-2 ring-brand-100"
                          : "border-slate-200 bg-white hover:border-slate-300",
                        blocked && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
                          {option.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                            RISK_STYLES[option.riskLevel],
                          )}
                        >
                          {option.riskLevel} risk
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-1 text-sm font-semibold text-slate-900">{option.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{option.contactEmail}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <StatusBadge status={option.status} />
                        {selected ? <Check className="h-4 w-4 text-brand-600" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600">
                Need a new supplier?{" "}
                <Link href="/vendors" className="font-medium text-brand-600 hover:text-brand-700">
                  Add a vendor profile
                </Link>{" "}
                and submit it for onboarding review.
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Describe the purchase</h2>
              <p className="mt-1 text-sm text-slate-500">
                Keep it specific — approvers see this alongside the policy evaluation.
              </p>
              <div className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="title" required>
                    Request title
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. MacBooks for two new platform engineers"
                    maxLength={140}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="department" required>
                      Department
                    </Label>
                    <Input
                      id="department"
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                      placeholder="Engineering"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      id="category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      {REQUEST_CATEGORIES.map((value) => (
                        <option key={value} value={value}>
                          {CATEGORY_LABELS[value] ?? humanize(value)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Urgency</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["LOW", "NORMAL", "HIGH"] as const).map((value) => {
                      const active = urgency === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setUrgency(value)}
                          className={cn(
                            "rounded-xl border px-3 py-2.5 text-left transition",
                            active
                              ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-100"
                              : "border-slate-200 bg-white hover:border-slate-300",
                          )}
                        >
                          <p className="text-sm font-medium text-slate-900">{URGENCY_COPY[value].label}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{URGENCY_COPY[value].hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label htmlFor="justification" required>
                    Business justification
                  </Label>
                  <Textarea
                    id="justification"
                    value={justification}
                    onChange={(event) => setJustification(event.target.value)}
                    placeholder="Why is this purchase needed, and what happens if it is delayed?"
                    maxLength={4000}
                  />
                  <p className="field-hint">{justification.length}/4000 characters</p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Line items</h2>
                  <p className="mt-1 text-sm text-slate-500">The total drives the approval policy.</p>
                </div>
                <Select
                  aria-label="Currency"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="w-28"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="SGD">SGD</option>
                </Select>
              </div>

              <div className="mt-5 space-y-3">
                {items.map((item, index) => (
                  <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        {index + 1}
                      </span>
                      <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_84px_120px_auto]">
                        <Input
                          aria-label={`Description for item ${index + 1}`}
                          placeholder="Description"
                          value={item.description}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((entry) =>
                                entry.key === item.key
                                  ? { ...entry, description: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        />
                        <Input
                          aria-label={`Quantity for item ${index + 1}`}
                          type="number"
                          min={1}
                          step={1}
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((entry) =>
                                entry.key === item.key ? { ...entry, quantity: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                        <Input
                          aria-label={`Unit price for item ${index + 1}`}
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Unit price"
                          value={item.unitPrice}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((entry) =>
                                entry.key === item.key ? { ...entry, unitPrice: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Remove item ${index + 1}`}
                          onClick={() =>
                            setItems((current) =>
                              current.length === 1
                                ? current
                                : current.filter((entry) => entry.key !== item.key),
                            )
                          }
                          disabled={items.length === 1}
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-rose-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end pr-1 text-xs text-slate-500">
                      Line total{" "}
                      <span className="ml-1 font-medium tabular-nums text-slate-800">
                        {formatMoney(lineTotal(item), currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setItems((current) => [...current, newItem()])}
              >
                <Plus className="h-4 w-4" />
                Add line item
              </Button>
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
              {draftId ? (
                <Link href={`/requests/${draftId}`} className="ml-1 font-medium underline">
                  Open saved draft
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setStep((current) => Math.max(0, current - 1));
              }}
              disabled={step === 0 || submitting}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {step < 2 ? (
              <Button onClick={goNext}>
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {submitting ? "Starting workflow…" : "Create & submit"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="sticky top-24">
          <CardContent className="space-y-5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <CircleDollarSign className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Request total</p>
                <p className="text-xl font-semibold tabular-nums text-slate-900">
                  {formatMoney(totalCents, currency)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vendor</p>
              {vendor ? (
                <div className="mt-2">
                  <p className="text-sm font-medium text-slate-900">{vendor.name}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={vendor.status} />
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                        RISK_STYLES[vendor.riskLevel],
                      )}
                    >
                      {vendor.riskLevel} risk
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No vendor selected</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Policy preview
              </p>
              <ol className="mt-3 space-y-2.5">
                {chain.map((role, index) => (
                  <li key={role} className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                      {index + 1}
                    </span>
                    <span className="text-slate-700">{role}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                The server-side policy engine is authoritative. Department rules and urgency SLAs may
                add steps.
              </p>
            </div>

            {totalCents > 1_000_000 ? (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Purchases over $10,000 include admin/compliance review. Plan for a longer SLA.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
