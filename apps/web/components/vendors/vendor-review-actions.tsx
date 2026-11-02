"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { RISK_LEVELS, type RiskLevel, type VendorStatus } from "@procureflow/shared/domain";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";

export function VendorReviewActions({
  vendorId,
  status,
  riskLevel,
  canReview,
}: {
  vendorId: string;
  status: VendorStatus;
  riskLevel: RiskLevel;
  canReview: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [decisionRisk, setDecisionRisk] = useState<RiskLevel>(riskLevel);

  if (!canReview || status === "APPROVED" || status === "BLOCKED") return null;

  async function startReview() {
    setBusy("review");
    setError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/review`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not start vendor review");
      setPanel(false);
      setTimeout(() => router.refresh(), 1_200);
      setTimeout(() => router.refresh(), 3_000);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function decide(decision: "APPROVE" | "BLOCK") {
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          comment: comment.trim() || (decision === "APPROVE" ? "Approved after compliance review" : ""),
          riskLevel: decisionRisk,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not record the vendor decision");
      setPanel(false);
      setComment("");
      setTimeout(() => router.refresh(), 1_200);
      setTimeout(() => router.refresh(), 3_000);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (status === "DRAFT") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" onClick={startReview} disabled={busy !== null}>
          {busy === "review" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Start review
        </Button>
        {error ? <p className="max-w-[180px] text-right text-[11px] text-rose-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!panel ? (
        <Button size="sm" variant="outline" onClick={() => setPanel(true)}>
          <ShieldCheck className="h-3.5 w-3.5" />
          Review vendor
        </Button>
      ) : (
        <div className="w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lift">
          <p className="text-xs font-semibold text-slate-900">Compliance decision</p>
          <div className="mt-2">
            <Label htmlFor={`risk-${vendorId}`} className="text-[11px]">
              Risk level
            </Label>
            <Select
              id={`risk-${vendorId}`}
              value={decisionRisk}
              onChange={(event) => setDecisionRisk(event.target.value as RiskLevel)}
              className="h-8 text-xs"
            >
              {RISK_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Review note (required to block)"
            className="mt-2 min-h-[64px] text-xs"
            maxLength={2000}
          />
          {error ? <p className="mt-1 text-[11px] text-rose-600">{error}</p> : null}
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="h-8 flex-1 px-2 text-xs" onClick={() => decide("APPROVE")} disabled={busy !== null}>
              {busy === "APPROVE" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 px-2 text-xs text-rose-600"
              onClick={() => decide("BLOCK")}
              disabled={busy !== null}
            >
              {busy === "BLOCK" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldX className="h-3 w-3" />}
              Block
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
