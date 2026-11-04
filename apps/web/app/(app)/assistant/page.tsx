import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Procurement assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const user = await requirePageUser();
  const model = process.env.ASSISTANT_MODEL ?? "phi4-mini:3.8b";
  const quantization = process.env.ASSISTANT_MODEL_QUANTIZATION ?? "Q4_K_M";
  const canIntake = user.role === "REQUESTER" || user.role === "ADMIN";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Procurement assistant"
        description="A controlled intake conversation. The assistant can ask, look up grounded facts, and prepare a draft; your existing RBAC and approval workflow remain authoritative."
        actions={
          user.role !== "REQUESTER" ? (
            <Link
              href="/assistant/reviews"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Review queue <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null
        }
      />

      {canIntake ? (
        <AssistantChat model={model} quantization={quantization} role={user.role} />
      ) : (
        <div className="surface p-8">
          <Bot className="h-7 w-7 text-brand-600" />
          <h2 className="mt-4 text-lg font-semibold">Assistant intake is requester-scoped</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Your {user.role.toLowerCase()} role can review assistant escalations but cannot start a
            requisition intake. Open the review queue to act on items within your scope.
          </p>
          <Link href="/assistant/reviews" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
            Open review queue <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
