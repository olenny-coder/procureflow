"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Review = {
  id: string;
  conversationId: string;
  slotKey?: string | null;
  kind: string;
  proposedValue: unknown;
  sourceSnippet: string;
  confidence?: number | null;
  band?: string | null;
  reason: string;
  status: string;
  assignedRole: string;
  turnId?: string | null;
  createdAt: string;
};

export function ReviewQueue() {
  const [items, setItems] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/assistant/reviews");
      const data = (await response.json()) as { items?: Review[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Could not load reviews.");
      setItems(data.items ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load reviews.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, decision: "APPROVE" | "REJECT" | "EDIT", value?: unknown) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/assistant/reviews/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, value, note: "" }),
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Could not record the decision.");
      setItems((current) => current.filter((item) => item.id !== id));
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record the decision.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading review queue…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="surface p-8 text-center">
        <Check className="mx-auto h-6 w-6 text-emerald-600" />
        <p className="mt-3 text-sm font-medium">Review queue is clear</p>
        <p className="mt-1 text-xs text-slate-500">
          Low-confidence, guardrail, or finalization escalations will appear here within your role scope.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {item.kind === "SLOT"
                  ? `Proposed ${item.slotKey ?? "value"}`
                  : item.kind === "FINALIZE"
                    ? "Finalization review"
                    : item.kind === "POLICY"
                      ? "Policy lookup escalation"
                      : item.kind === "SUPPLIER"
                        ? "Supplier lookup escalation"
                        : "Malformed model output"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {item.assignedRole} scope · {item.band ?? "no band"} ·{" "}
                {item.confidence === null || item.confidence === undefined
                  ? "no logprob"
                  : `mean logprob ${item.confidence.toFixed(3)}`}
                {item.turnId ? ` · turn ${item.turnId.slice(0, 8)}` : ""}
              </p>
            </div>
            <span className="border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-amber-800">
              pending
            </span>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="border border-slate-200 bg-slate-50 p-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-400">Proposed value</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-slate-700">
                {JSON.stringify(item.proposedValue, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-400">Why escalated</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{item.reason}</p>
              <p className="mt-2 font-mono text-[10px] text-slate-400">“{item.sourceSnippet}”</p>
            </div>
          </div>

          {editing === item.id ? (
            <div className="mt-3">
              <textarea
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-brand-500"
                aria-label="Edited value JSON"
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    try {
                      void decide(item.id, "EDIT", JSON.parse(editValue));
                    } catch {
                      setError("Edited value must be valid JSON.");
                    }
                  }}
                  disabled={busy === item.id}
                >
                  Save edit & approve
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void decide(item.id, "APPROVE")} disabled={busy === item.id || item.kind === "MALFORMED"}>
                {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve
              </Button>
              <Button variant="outline" size="sm" onClick={() => void decide(item.id, "REJECT")} disabled={busy === item.id}>
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy === item.id || item.kind === "MALFORMED"}
                onClick={() => {
                  setEditing(item.id);
                  setEditValue(JSON.stringify(item.proposedValue, null, 2));
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit & approve
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
