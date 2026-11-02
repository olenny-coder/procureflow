import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              "radial-gradient(60% 60% at 12% 8%, rgba(99,102,241,0.45), transparent 60%), radial-gradient(55% 55% at 88% 90%, rgba(14,165,233,0.28), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-bold ring-1 ring-white/20 backdrop-blur">
              PF
            </div>
            <div>
              <p className="font-semibold tracking-tight">ProcureFlow</p>
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">Procurement OS</p>
            </div>
          </div>

          <div className="mt-20 max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-300">
              Intake → policy → approvals → PO → audit
            </p>
            <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.1] tracking-tight">
              Procurement without the chase.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-white/70">
              One durable workflow per purchase request. Policy decides the approval chain, Temporal
              holds the state, and every decision lands in an append-only audit trail.
            </p>
          </div>

          <div className="mt-12 grid max-w-lg gap-3">
            {[
              ["Policy-driven routing", "Amount, vendor risk, urgency and department rules compose the approval chain automatically."],
              ["Durable by construction", "Approval waits, SLAs and escalations survive worker restarts — no cron jobs or lost state."],
              ["Audit-ready", "Every action is attributed to an actor and written to append-only audit events."],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur"
              >
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
                  {title}
                </p>
                <p className="mt-1.5 pl-3.5 text-sm leading-relaxed text-white/60">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-4 text-xs text-white/40">
          <span>Temporal TypeScript SDK</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>PostgreSQL + Drizzle</span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span>Next.js</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
                PF
              </div>
              <span className="text-lg font-semibold tracking-tight">ProcureFlow</span>
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Sign in with a demo account to run the procurement flow end to end.
          </p>
          <LoginForm callbackUrl={searchParams.callbackUrl ?? "/"} />
        </div>
      </section>
    </div>
  );
}
