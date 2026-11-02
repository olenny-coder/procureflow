"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Action = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

export function ApprovalActions({
  taskId,
  requestId,
  role,
  className,
}: {
  taskId: string;
  requestId: string;
  role: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(action: Action) {
    setError(null);
    setMessage(null);
    if ((action === "REJECT" || action === "REQUEST_CHANGES") && comment.trim().length < 3) {
      setError("Add a comment explaining your decision.");
      return;
    }
    setBusy(action);
    try {
      const response = await fetch(`/api/approvals/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment: comment.trim() || undefined }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "The decision could not be sent");
      }
      setMessage(
        action === "APPROVE"
          ? "Approval sent. The workflow is advancing…"
          : action === "REJECT"
            ? "Rejection sent. Closing the request…"
            : "Change request sent. Waiting for the requester…",
      );
      setComment("");
      setTimeout(() => router.refresh(), 1_500);
      setTimeout(() => router.refresh(), 3_500);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-slate-50/50 p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">
          Your decision{role ? ` · ${role.toLowerCase()} step` : ""}
        </p>
        <span className="text-[11px] text-slate-400">Signals the Temporal workflow</span>
      </div>
      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Add context for the requester and the audit trail (required to reject or request changes)."
        className="mt-3 min-h-[76px] bg-white"
        maxLength={2000}
      />
      {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
      {message ? <p className="mt-2 text-xs font-medium text-emerald-700">{message}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => submit("APPROVE")} disabled={busy !== null}>
          {busy === "APPROVE" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => submit("REQUEST_CHANGES")}
          disabled={busy !== null}
        >
          {busy === "REQUEST_CHANGES" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquareWarning className="h-3.5 w-3.5" />
          )}
          Request changes
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          onClick={() => submit("REJECT")}
          disabled={busy !== null}
        >
          {busy === "REJECT" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Reject
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Request {requestId.slice(0, 8)} · decision is recorded by a worker activity, not this page.
      </p>
    </div>
  );
}
