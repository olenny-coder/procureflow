"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Bot, FileText, Loader2, Send, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";

type Message = { role: "user" | "assistant"; content: string };
type TurnResponse = {
  conversationId: string;
  assistantMessage: string;
  state: string;
  status: string;
  reviewId?: string | null;
  requestId?: string | null;
};

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-ink-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function AssistantChat({
  model,
  quantization,
  role,
}: {
  model: string;
  quantization: string;
  role: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const started = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start = async () => {
      try {
        const response = await fetch("/api/assistant/conversations", { method: "POST" });
        const data = (await response.json()) as TurnResponse & { error?: { message?: string } };
        if (!response.ok) throw new Error(data.error?.message ?? "Could not start the assistant.");
        setConversationId(data.conversationId);
        setMessages([{ role: "assistant", content: data.assistantMessage }]);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not start the assistant.");
      } finally {
        setLoading(false);
      }
    };
    void start();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || !conversationId || sending) return;
    setInput("");
    setError(null);
    setSending(true);
    setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      const response = await fetch(`/api/assistant/conversations/${conversationId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await response.json()) as TurnResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "The assistant could not respond.");
      setMessages((current) => [...current, { role: "assistant", content: data.assistantMessage }]);
      setReviewId(data.reviewId ?? null);
      setRequestId(data.requestId ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The assistant could not respond.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="surface flex min-h-[620px] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Procurement assistant</p>
              <p className="text-[11px] text-slate-500">
                {model} · {quantization} · local Ollama
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
            <ShieldCheck className="h-3 w-3" />
            RBAC scoped
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 px-4 py-5 sm:px-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Starting a scoped intake…
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <motion.div
                key={`${message.role}-${index}-${message.content.slice(0, 16)}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={`flex gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" ? (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-900 text-white">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                ) : null}
                <div
                  className={`max-w-[85%] whitespace-pre-wrap px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    message.role === "user"
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {message.role === "assistant" ? renderBold(message.content) : message.content}
                </div>
                {message.role === "user" ? (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                    <User className="h-3.5 w-3.5" />
                  </div>
                ) : null}
              </motion.div>
            ))}
          </AnimatePresence>

          {sending ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the next controlled step…
            </div>
          ) : null}
          {error ? (
            <div className="flex items-start gap-2 border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
          className="border-t border-slate-200 bg-white p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              disabled={!conversationId || sending}
              placeholder="Type a vendor, amount, category, or a policy question…"
              className="min-h-[42px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-slate-50"
            />
            <Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim() || sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">
            The assistant can propose values but cannot submit, approve, or bypass policy. Confirm each
            readback before a draft is created.
          </p>
        </form>
      </div>

      <aside className="space-y-3">
        <div className="surface p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">Controls</p>
          <ul className="mt-3 space-y-2.5 text-[12px] leading-relaxed text-slate-600">
            <li>One or two slots per turn; every value is read back.</li>
            <li>Policy and supplier answers come from the local stores.</li>
            <li>Low confidence or failed guardrails go to a human.</li>
            <li>Only a draft requisition can be created here.</li>
          </ul>
        </div>
        {reviewId ? (
          <div className="surface border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-900">Human review requested</p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
              No value or request will be written until a reviewer decides.
            </p>
            {role !== "REQUESTER" ? (
              <Link
                href="/assistant/reviews"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 underline"
              >
                Open review queue <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <p className="mt-2 text-[10px] text-amber-800">
                You cannot approve your own escalation. A reviewer will decide.
              </p>
            )}
          </div>
        ) : null}
        {requestId ? (
          <div className="surface border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold text-emerald-900">Draft created</p>
            <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
              This is a draft only; nothing was submitted or approved.
            </p>
            <Link
              href={`/requests/${requestId}`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-900 underline"
            >
              Open draft <FileText className="h-3 w-3" />
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
