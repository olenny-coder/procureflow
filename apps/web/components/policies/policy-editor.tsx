"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import {
  RISK_LEVELS,
  ROLES,
  URGENCIES,
  type RiskLevel,
  type Role,
  type Urgency,
} from "@procureflow/shared/domain";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

export interface EditablePolicy {
  id: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  conditions: Record<string, unknown>;
  approvers: Array<{ role: Role; dueInHours: number }>;
}

interface ApproverDraft {
  key: string;
  role: Role;
  dueInHours: string;
}

function amountValue(conditions: Record<string, unknown>, key: string): string {
  const value = conditions[key];
  return typeof value === "number" ? String(value / 100) : "";
}

function listValue(conditions: Record<string, unknown>, key: string): string {
  const value = conditions[key];
  return Array.isArray(value) ? value.join(", ") : "";
}

function arrayValue<T extends string>(conditions: Record<string, unknown>, key: string): T[] {
  const value = conditions[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function PolicyEditor({ policy }: { policy?: EditablePolicy }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(policy?.name ?? "");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [priority, setPriority] = useState(String(policy?.priority ?? 100));
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [minAmount, setMinAmount] = useState(
    policy ? amountValue(policy.conditions, "minAmountCents") : "",
  );
  const [maxAmount, setMaxAmount] = useState(
    policy ? amountValue(policy.conditions, "maxAmountCents") : "",
  );
  const [departments, setDepartments] = useState(
    policy ? listValue(policy.conditions, "departments") : "",
  );
  const [categories, setCategories] = useState(
    policy ? listValue(policy.conditions, "categories") : "",
  );
  const [riskLevels, setRiskLevels] = useState<RiskLevel[]>(
    policy ? arrayValue<RiskLevel>(policy.conditions, "vendorRiskLevels") : [],
  );
  const [urgencies, setUrgencies] = useState<Urgency[]>(
    policy ? arrayValue<Urgency>(policy.conditions, "urgencies") : [],
  );
  const [approvers, setApprovers] = useState<ApproverDraft[]>(
    policy?.approvers?.map((approver) => ({
      key: Math.random().toString(36).slice(2),
      role: approver.role,
      dueInHours: String(approver.dueInHours),
    })) ?? [{ key: Math.random().toString(36).slice(2), role: "APPROVER", dueInHours: "24" }],
  );

  function toggleRisk(level: RiskLevel) {
    setRiskLevels((current) =>
      current.includes(level) ? current.filter((entry) => entry !== level) : [...current, level],
    );
  }

  function toggleUrgency(value: Urgency) {
    setUrgencies((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const conditions = {
        ...(minAmount.trim() ? { minAmountCents: Math.round(Number(minAmount) * 100) } : {}),
        ...(maxAmount.trim() ? { maxAmountCents: Math.round(Number(maxAmount) * 100) } : {}),
        ...(departments.trim()
          ? { departments: departments.split(",").map((part) => part.trim()).filter(Boolean) }
          : {}),
        ...(categories.trim()
          ? { categories: categories.split(",").map((part) => part.trim()).filter(Boolean) }
          : {}),
        ...(riskLevels.length ? { vendorRiskLevels: riskLevels } : {}),
        ...(urgencies.length ? { urgencies } : {}),
      };

      const payload = {
        name,
        description,
        priority: Number(priority) || 100,
        enabled,
        conditions,
        approvers: approvers.map((approver) => ({
          role: approver.role,
          dueInHours: Number(approver.dueInHours) || 24,
        })),
      };

      const response = await fetch(policy ? `/api/policies/${policy.id}` : "/api/policies", {
        method: policy ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Could not save the policy");
      }
      setOpen(false);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {policy ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New policy
        </Button>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm sm:p-8">
          <div className="surface my-auto w-full max-w-3xl animate-fade-up">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {policy ? "Edit policy" : "New policy"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Lower priority numbers evaluate first. Matching rules merge into one approval chain.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-6 overflow-y-auto p-5 scrollbar-thin">
              <div className="grid gap-4 sm:grid-cols-[1fr_120px_100px]">
                <div>
                  <Label htmlFor={`policy-name-${policy?.id ?? "new"}`} required>
                    Policy name
                  </Label>
                  <Input
                    id={`policy-name-${policy?.id ?? "new"}`}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. High-value purchase review"
                  />
                </div>
                <div>
                  <Label htmlFor={`policy-priority-${policy?.id ?? "new"}`}>Priority</Label>
                  <Input
                    id={`policy-priority-${policy?.id ?? "new"}`}
                    type="number"
                    min={0}
                    max={1000}
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor={`policy-enabled-${policy?.id ?? "new"}`}>Enabled</Label>
                  <button
                    id={`policy-enabled-${policy?.id ?? "new"}`}
                    type="button"
                    onClick={() => setEnabled((current) => !current)}
                    className={`flex h-10 w-full items-center justify-center rounded-xl border text-sm font-medium ${
                      enabled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {enabled ? "Active" : "Disabled"}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor={`policy-description-${policy?.id ?? "new"}`}>Description</Label>
                <Textarea
                  id={`policy-description-${policy?.id ?? "new"}`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-[64px]"
                  placeholder="Explain when this rule applies."
                />
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Conditions</p>
                <p className="mt-1 text-xs text-slate-500">
                  Leave a field empty to match everything. All populated conditions must match (AND).
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`policy-min-${policy?.id ?? "new"}`}>Minimum amount (USD)</Label>
                    <Input
                      id={`policy-min-${policy?.id ?? "new"}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={minAmount}
                      onChange={(event) => setMinAmount(event.target.value)}
                      placeholder="1000.01"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`policy-max-${policy?.id ?? "new"}`}>Maximum amount (USD)</Label>
                    <Input
                      id={`policy-max-${policy?.id ?? "new"}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={maxAmount}
                      onChange={(event) => setMaxAmount(event.target.value)}
                      placeholder="10000"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`policy-depts-${policy?.id ?? "new"}`}>Departments (comma separated)</Label>
                    <Input
                      id={`policy-depts-${policy?.id ?? "new"}`}
                      value={departments}
                      onChange={(event) => setDepartments(event.target.value)}
                      placeholder="Engineering, IT"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`policy-categories-${policy?.id ?? "new"}`}>Categories (comma separated)</Label>
                    <Input
                      id={`policy-categories-${policy?.id ?? "new"}`}
                      value={categories}
                      onChange={(event) => setCategories(event.target.value)}
                      placeholder="SOFTWARE, IT_HARDWARE"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Vendor risk levels</Label>
                    <div className="flex gap-2">
                      {RISK_LEVELS.map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => toggleRisk(level)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                            riskLevels.includes(level)
                              ? "border-brand-300 bg-brand-50 text-brand-700"
                              : "border-slate-200 bg-white text-slate-500"
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Urgency</Label>
                    <div className="flex gap-2">
                      {URGENCIES.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => toggleUrgency(value)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                            urgencies.includes(value)
                              ? "border-brand-300 bg-brand-50 text-brand-700"
                              : "border-slate-200 bg-white text-slate-500"
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Approvers
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Steps are executed manager → finance → admin. Empty means auto-approve.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setApprovers((current) => [
                        ...current,
                        {
                          key: Math.random().toString(36).slice(2),
                          role: "FINANCE",
                          dueInHours: "24",
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add step
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {approvers.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-700">
                      No approvers — matching requests are auto-approved and a PO is issued immediately.
                    </p>
                  ) : null}
                  {approvers.map((approver, index) => (
                    <div key={approver.key} className="flex items-center gap-2">
                      <span className="w-12 text-xs text-slate-400">Step {index + 1}</span>
                      <Select
                        value={approver.role}
                        onChange={(event) =>
                          setApprovers((current) =>
                            current.map((entry) =>
                              entry.key === approver.key
                                ? { ...entry, role: event.target.value as Role }
                                : entry,
                            ),
                          )
                        }
                        className="h-9 flex-1 text-xs"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={approver.dueInHours}
                        onChange={(event) =>
                          setApprovers((current) =>
                            current.map((entry) =>
                              entry.key === approver.key
                                ? { ...entry, dueInHours: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        className="h-9 w-24 text-xs"
                        aria-label="SLA hours"
                      />
                      <span className="text-xs text-slate-400">hours</span>
                      <button
                        type="button"
                        onClick={() =>
                          setApprovers((current) =>
                            current.filter((entry) => entry.key !== approver.key),
                          )
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remove approver"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-5">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {policy ? "Save changes" : "Create policy"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
