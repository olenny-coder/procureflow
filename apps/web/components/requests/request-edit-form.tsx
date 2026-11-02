"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import {
  CATEGORY_LABELS,
  REQUEST_CATEGORIES,
  dollarsToCents,
  formatMoney,
} from "@procureflow/shared/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

interface VendorOption {
  id: string;
  name: string;
  status: string;
}

interface EditableRequest {
  id: string;
  title: string;
  justification: string;
  department: string;
  category: string;
  urgency: "LOW" | "NORMAL" | "HIGH";
  currency: string;
  vendorId: string;
  status: string;
  items: Array<{ description: string; quantity: number; unitPriceCents: number }>;
}

interface ItemDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function lineTotal(item: ItemDraft): number {
  const qty = Number(item.quantity);
  const price = Number(item.unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price <= 0) return 0;
  return dollarsToCents(price) * Math.floor(qty);
}

export function RequestEditForm({
  request,
  vendors,
}: {
  request: EditableRequest;
  vendors: VendorOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(request.title);
  const [justification, setJustification] = useState(request.justification);
  const [department, setDepartment] = useState(request.department);
  const [category, setCategory] = useState(request.category);
  const [urgency, setUrgency] = useState(request.urgency);
  const [currency, setCurrency] = useState(request.currency);
  const [vendorId, setVendorId] = useState(request.vendorId);
  const [items, setItems] = useState<ItemDraft[]>(
    request.items.map((item) => ({
      key: Math.random().toString(36).slice(2),
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: (item.unitPriceCents / 100).toFixed(2),
    })),
  );
  const [busy, setBusy] = useState<"save" | "resubmit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalCents = useMemo(() => items.reduce((sum, item) => sum + lineTotal(item), 0), [items]);

  async function persist(resubmit: boolean) {
    setError(null);
    setBusy(resubmit ? "resubmit" : "save");
    try {
      const payload = {
        title,
        justification,
        department,
        category,
        urgency,
        currency,
        vendorId,
        items: items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      };
      const update = await fetch(`/api/requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const updateBody = await update.json().catch(() => null);
      if (!update.ok) {
        throw new Error(updateBody?.error?.message ?? "Could not save the request");
      }

      if (resubmit) {
        const submit = await fetch(`/api/requests/${request.id}/submit`, { method: "POST" });
        const submitBody = await submit.json().catch(() => null);
        if (!submit.ok) {
          throw new Error(
            submitBody?.error?.message ?? "Saved, but the approval workflow could not be resumed",
          );
        }
      }
      router.push(`/requests/${request.id}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Edit purchase request</CardTitle>
          <p className="text-sm text-slate-500">
            Changes are only allowed in Draft or Changes requested. Saving writes new line items and
            re-audits the request.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="edit-title" required>
              Title
            </Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={140}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-department">Department</Label>
              <Input
                id="edit-department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-vendor">Vendor</Label>
              <Select
                id="edit-vendor"
                value={vendorId}
                onChange={(event) => setVendorId(event.target.value)}
              >
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id} disabled={vendor.status === "BLOCKED"}>
                    {vendor.name}
                    {vendor.status === "BLOCKED" ? " (blocked)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="edit-category">Category</Label>
              <Select
                id="edit-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {REQUEST_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value] ?? value}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-urgency">Urgency</Label>
              <Select
                id="edit-urgency"
                value={urgency}
                onChange={(event) => setUrgency(event.target.value as EditableRequest["urgency"])}
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-currency">Currency</Label>
              <Select
                id="edit-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="SGD">SGD</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="edit-justification">Business justification</Label>
            <Textarea
              id="edit-justification"
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              maxLength={4000}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Line items</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((current) => [
                    ...current,
                    { key: Math.random().toString(36).slice(2), description: "", quantity: "1", unitPrice: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add item
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {items.map((item, index) => (
                <div key={item.key} className="flex items-start gap-2">
                  <Input
                    aria-label={`Description for item ${index + 1}`}
                    placeholder="Description"
                    value={item.description}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry) =>
                          entry.key === item.key ? { ...entry, description: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`Quantity for item ${index + 1}`}
                    type="number"
                    min={1}
                    className="w-20"
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
                    className="w-32"
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
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) => current.filter((entry) => entry.key !== item.key))
                    }
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <Link href={`/requests/${request.id}`}>
              <Button variant="ghost">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => persist(false)} disabled={busy !== null}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
              {request.status === "CHANGES_REQUESTED" ? (
                <Button onClick={() => persist(true)} disabled={busy !== null}>
                  {busy === "resubmit" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Save & resubmit
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit xl:sticky xl:top-24">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Total</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(totalCents, currency)}</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            Saving the request updates the PostgreSQL read model and writes a `REQUEST_UPDATED` audit
            event. Resubmitting sends the resubmit signal to the existing workflow, which re-evaluates
            policy and starts a new approval chain.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
