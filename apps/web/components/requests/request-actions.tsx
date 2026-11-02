"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RequestActions({
  requestId,
  status,
  isOwner,
}: {
  requestId: string;
  status: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"submit" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = isOwner && (status === "DRAFT" || status === "CHANGES_REQUESTED");
  const canCancel = isOwner && status === "DRAFT";
  if (!canSubmit && !canCancel) return null;

  async function run(action: "submit" | "cancel") {
    setError(null);
    setMessage(null);
    setBusy(action);
    try {
      const path = action === "submit" ? "submit" : "cancel";
      const response = await fetch(`/api/requests/${requestId}/${path}`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "The action could not be completed");
      }
      setMessage(
        action === "submit"
          ? "Approval workflow started. Refreshing as the worker picks it up…"
          : "Draft cancelled.",
      );
      setTimeout(() => router.refresh(), 1_200);
      setTimeout(() => router.refresh(), 3_000);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canSubmit ? (
          <Button onClick={() => run("submit")} disabled={busy !== null}>
            {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {status === "CHANGES_REQUESTED" ? "Resubmit for approval" : "Submit for approval"}
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="outline" onClick={() => run("cancel")} disabled={busy !== null}>
            {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Cancel draft
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-xs font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
