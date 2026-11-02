"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus, X } from "lucide-react";
import { RISK_LEVELS } from "@procureflow/shared/domain";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

export function VendorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    website: "",
    contactEmail: "",
    taxId: "",
    bankAccountMasked: "",
    riskLevel: "LOW",
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          website: form.website,
          contactEmail: form.contactEmail,
          taxId: form.taxId,
          bankAccountMasked: form.bankAccountMasked,
          riskLevel: form.riskLevel,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Could not create the vendor");
      }
      setOpen(false);
      setForm({
        name: "",
        website: "",
        contactEmail: "",
        taxId: "",
        bankAccountMasked: "",
        riskLevel: "LOW",
      });
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add vendor
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm sm:p-8">
          <div className="surface my-auto w-full max-w-xl animate-fade-up">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Add a vendor</p>
                  <p className="text-xs text-slate-500">Starts in DRAFT; submit for onboarding review next.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 p-5">
              <div>
                <Label htmlFor="vendor-name" required>
                  Vendor name
                </Label>
                <Input
                  id="vendor-name"
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Acme Cloud Services"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="vendor-contact" required>
                    Contact email
                  </Label>
                  <Input
                    id="vendor-contact"
                    type="email"
                    required
                    value={form.contactEmail}
                    onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
                    placeholder="sales@vendor.com"
                  />
                </div>
                <div>
                  <Label htmlFor="vendor-website">Website</Label>
                  <Input
                    id="vendor-website"
                    value={form.website}
                    onChange={(event) => setForm({ ...form, website: event.target.value })}
                    placeholder="https://vendor.com"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="vendor-tax">Tax ID</Label>
                  <Input
                    id="vendor-tax"
                    value={form.taxId}
                    onChange={(event) => setForm({ ...form, taxId: event.target.value })}
                    placeholder="US-00-0000000"
                  />
                </div>
                <div>
                  <Label htmlFor="vendor-bank">Bank account (masked)</Label>
                  <Input
                    id="vendor-bank"
                    value={form.bankAccountMasked}
                    onChange={(event) => setForm({ ...form, bankAccountMasked: event.target.value })}
                    placeholder="****1234"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="vendor-risk">Declared risk level</Label>
                <Select
                  id="vendor-risk"
                  value={form.riskLevel}
                  onChange={(event) => setForm({ ...form, riskLevel: event.target.value })}
                >
                  {RISK_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
                <p className="field-hint">
                  High-risk vendors add a compliance approval to every purchase request.
                </p>
              </div>

              {error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create vendor
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
