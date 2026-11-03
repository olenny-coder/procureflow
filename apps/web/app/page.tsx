import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileCheck2,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Timer,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { HeroRequestPanel } from "@/components/marketing/hero-panel";

export const metadata: Metadata = {
  title: "ProcureFlow — Every purchase. One clear path.",
  description:
    "Policy-driven purchase intake, durable approvals and auditable purchase orders. One system from request to PO.",
};

const FLOW = [
  ["01", "Intake", "Structured request"],
  ["02", "Policy", "Deterministic routing"],
  ["03", "Approve", "Signals and SLAs"],
  ["04", "Issue", "PO + ERP sync"],
  ["05", "Audit", "Append-only trail"],
];

const STEPS = [
  {
    label: "Intake",
    body: "Vendors, line items, budget and justification in one structured request.",
    meta: "Request + items",
  },
  {
    label: "Evaluate",
    body: "Amount, department, urgency and vendor risk compose the approval chain.",
    meta: "Rules + version",
  },
  {
    label: "Approve",
    body: "Role-based decisions over durable signals, with SLA escalation built in.",
    meta: "Decision + reason",
  },
  {
    label: "Issue",
    body: "A PO number is generated, synced to the ERP and written to the ledger.",
    meta: "PO + reference",
  },
  {
    label: "Audit",
    body: "Every submission, decision and policy evaluation is attributable.",
    meta: "Immutable events",
  },
];

const TEAMS = [
  {
    name: "IT & hardware",
    inputs: "Laptops, monitors, licenses",
    policy: "Manager + finance, asset class rules",
    outcome: "PO issued, asset-ready",
  },
  {
    name: "Software",
    inputs: "SaaS seats, renewals, usage",
    policy: "Budget owner, security review",
    outcome: "Contract handoff",
  },
  {
    name: "Professional services",
    inputs: "SOWs, retainers, milestones",
    policy: "High-risk vendor, compliance",
    outcome: "Approved engagement",
  },
  {
    name: "Office & facilities",
    inputs: "Furniture, supplies, services",
    policy: "Department thresholds",
    outcome: "PO + delivery",
  },
  {
    name: "Marketing",
    inputs: "Agencies, media, events",
    policy: "Campaign budget, finance",
    outcome: "Spend under control",
  },
];

const CONTROLS = [
  ["Thresholds that match policy", "Low-value auto-approval, manager and finance bands, high-value escalation."],
  ["Vendor risk in the chain", "High-risk or unapproved vendors add compliance automatically."],
  ["SLA escalation, not chasing", "Approvals escalate to the next role when the deadline passes."],
  ["Separation of duties", "Requesters cannot approve their own purchases; roles are enforced server-side."],
  ["POs with a paper trail", "PO numbers, ERP references and every state transition are recorded."],
  ["Policy changes, versioned", "Admins edit rules; in-flight requests keep the chain they started with."],
];

const SECURITY = [
  ["Role-based access", "Requester, approver, finance and admin scopes enforced on every route."],
  ["Immutable audit", "Append-only events with actor, action, metadata and idempotency keys."],
  ["Segregation of duties", "No self-approval; approval roles are checked at the API and the activity."],
  ["Durable executions", "Approval state survives worker restarts, deployments and timeouts."],
  ["Policy flexibility", "Thresholds, departments, categories, vendor risk and urgency."],
  ["Deployment choice", "Run locally, self-host, or deploy the app against a managed workflow endpoint."],
];

function SectionLabel({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.2em] ${light ? "text-white/40" : "text-ink-900/40"}`}>
      {children}
    </span>
  );
}

function PrincipleArt({ kind }: { kind: "composable" | "accountable" | "auditable" }) {
  if (kind === "composable") {
    return (
      <svg viewBox="0 0 200 90" className="h-[90px] w-full" fill="none" aria-hidden>
        <rect x="8" y="20" width="46" height="30" stroke="rgba(255,255,255,0.32)" />
        <rect x="8" y="58" width="46" height="24" stroke="rgba(255,255,255,0.18)" />
        <rect x="80" y="12" width="46" height="24" stroke="rgba(255,255,255,0.25)" />
        <rect x="80" y="46" width="46" height="24" stroke="rgba(255,255,255,0.25)" />
        <path d="M54 35h12l14-17M54 70h12l14-16" stroke="#2f6df6" strokeWidth="1.2" />
        <path d="M126 24h30M126 58h30" stroke="rgba(255,255,255,0.2)" />
        <rect x="156" y="18" width="12" height="12" fill="#2f6df6" />
        <rect x="156" y="52" width="12" height="12" fill="#2f6df6" />
      </svg>
    );
  }
  if (kind === "accountable") {
    return (
      <svg viewBox="0 0 200 90" className="h-[90px] w-full" fill="none" aria-hidden>
        <path d="M8 28h184M8 46h184M8 64h184" stroke="rgba(255,255,255,0.18)" strokeDasharray="4 5" />
        <circle cx="34" cy="28" r="4" fill="#2f6df6" />
        <circle cx="34" cy="46" r="4" stroke="rgba(255,255,255,0.55)" />
        <circle cx="34" cy="64" r="4" stroke="rgba(255,255,255,0.25)" />
        <path d="M34 28v18M34 46v18" stroke="rgba(255,255,255,0.22)" />
        <rect x="52" y="21" width="60" height="14" fill="rgba(255,255,255,0.08)" />
        <rect x="52" y="39" width="84" height="14" fill="rgba(255,255,255,0.05)" />
        <rect x="52" y="57" width="44" height="14" fill="rgba(255,255,255,0.03)" />
        <text x="122" y="31" fill="rgba(255,255,255,0.4)" fontSize="7" fontFamily="monospace">APPROVED</text>
        <text x="146" y="49" fill="rgba(255,255,255,0.22)" fontSize="7" fontFamily="monospace">WAITING</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 90" className="h-[90px] w-full" fill="none" aria-hidden>
      <rect x="8" y="10" width="60" height="14" fill="rgba(255,255,255,0.85)" />
      <rect x="8" y="32" width="96" height="14" fill="rgba(255,255,255,0.5)" />
      <rect x="8" y="54" width="76" height="14" fill="rgba(255,255,255,0.22)" />
      <rect x="8" y="76" width="40" height="10" fill="#2f6df6" />
      <path d="M126 17h64M126 39h52M126 61h64M126 83h36" stroke="rgba(255,255,255,0.25)" />
      <text x="126" y="8" fill="rgba(255,255,255,0.28)" fontSize="7" fontFamily="monospace">ACTOR</text>
      <text x="172" y="8" fill="rgba(255,255,255,0.28)" fontSize="7" fontFamily="monospace">HASH</text>
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-paper">
      <MarketingNav />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-ink-900 text-white">
          <div className="pointer-events-none absolute inset-0 landing-grid opacity-70" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(47,109,246,0.2),transparent)]" />
          <div className="relative mx-auto max-w-[1320px] px-5 pb-14 pt-16 sm:px-8 sm:pt-20 lg:pt-24">
            <div className="grid items-center gap-14 xl:grid-cols-[1.12fr_0.88fr]">
              <div className="animate-fade-up">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 bg-brand-500" />
                  <SectionLabel light>Procurement orchestration</SectionLabel>
                </div>
                <h1 className="mt-6 text-balance text-[clamp(3.5rem,6.5vw,5.15rem)] font-bold leading-[0.93] tracking-[-0.055em]">
                  Every purchase.
                  <br />
                  <span className="text-white/35">One clear path.</span>
                </h1>
                <p className="mt-7 max-w-xl text-[16px] leading-relaxed text-white/55 sm:text-[17px]">
                  Structured intake, policy-driven approvals, purchase orders and an audit trail in one
                  system. ProcureFlow replaces email threads and spreadsheets with a path everyone can
                  see.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login"
                    className="group inline-flex h-11 items-center gap-3 bg-brand-500 px-5 text-[14px] font-medium text-white transition hover:bg-brand-400"
                  >
                    Start a request
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a
                    href="#workflow"
                    className="inline-flex h-11 items-center gap-3 border border-white/20 px-5 text-[14px] font-medium text-white/80 transition hover:border-white/40 hover:text-white"
                  >
                    See how it works
                  </a>
                </div>
                <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/10 pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-3 w-3 text-brand-400" /> Policy checked
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-3 w-3 text-brand-400" /> Durably approved
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-3 w-3 text-brand-400" /> Audit ready
                  </span>
                </div>
              </div>

              <div className="animate-fade-up xl:pl-4">
                <HeroRequestPanel />
              </div>
            </div>

            <div className="mt-14 grid grid-cols-2 border-t border-white/10 sm:grid-cols-3 lg:grid-cols-5">
              {FLOW.map(([number, label, copy]) => (
                <div key={number} className="border-b border-white/10 py-4 sm:border-b-0 lg:border-r lg:last:border-r-0 lg:pl-4 lg:first:pl-0">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 bg-brand-500" />
                    <span className="font-mono text-[9px] tracking-[0.14em] text-white/30">{number}</span>
                    <span className="text-[12px] font-medium text-white/80">{label}</span>
                  </div>
                  <p className="mt-1 pl-3.5 text-[11px] text-white/35">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Proof */}
        <section className="bg-paper text-ink-900">
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-8 border-t border-ink-900/10 pt-5 md:grid-cols-[160px_1fr]">
              <SectionLabel>Proof</SectionLabel>
              <div>
                <h2 className="max-w-4xl text-[clamp(2.6rem,4.6vw,3.9rem)] font-medium leading-[1.02] tracking-[-0.045em]">
                  Procurement shouldn&apos;t feel like chasing.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-ink-900/55">
                  One request creates one verifiable path. No forwarded approvals, no lost context, no
                  reconstructed audit trail after the fact.
                </p>
              </div>
            </div>

            <div className="mt-16 grid border-y border-ink-900/10 md:grid-cols-3">
              {[
                ["3×", "faster approval cycles", "Structured intake and policy routing remove the back-and-forth."],
                ["100%", "decisions audited", "Every approval, rejection and change request is attributed."],
                ["0", "purchases outside policy", "Amount, vendor risk and urgency are evaluated before any PO."],
              ].map(([stat, label, copy], index) => (
                <div
                  key={label}
                  className={`py-7 md:px-7 ${index > 0 ? "border-t border-ink-900/10 md:border-l md:border-t-0" : ""} ${index === 0 ? "md:pl-0" : ""}`}
                >
                  <p className="text-[clamp(3.6rem,6vw,5rem)] font-medium leading-none tracking-[-0.06em]">
                    {stat}
                  </p>
                  <p className="mt-4 text-[14px] font-medium text-ink-900">{label}</p>
                  <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-900/45">{copy}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {["Audit-ready", "Role-based access", "Configurable policy", "ERP handoff"].map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 border border-ink-900/15 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-900/55"
                  >
                    <Check className="h-2.5 w-2.5 text-brand-600" />
                    {badge}
                  </span>
                ))}
              </div>
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 text-[13px] font-medium text-ink-900"
              >
                Open the demo
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section id="platform" className="bg-ink-900 text-white">
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-24">
            <div className="border-t border-white/10 pt-5">
              <SectionLabel light>Platform</SectionLabel>
            </div>
            <h2 className="mx-auto mt-8 max-w-5xl text-center text-[clamp(2.7rem,5vw,4.4rem)] font-medium leading-[1.0] tracking-[-0.05em]">
              Composable. Accountable. Auditable.
            </h2>
            <div className="mt-16 grid border-t border-white/10 md:grid-cols-3">
              {[
                {
                  title: "Composable",
                  copy: "Policies, approval chains, vendors and integrations are separate parts. Change a rule without rebuilding the flow.",
                  art: "composable" as const,
                  href: "#workflow",
                },
                {
                  title: "Accountable",
                  copy: "Approvals run as durable signals with named actors, SLAs and escalation. State survives restarts and deploys.",
                  art: "accountable" as const,
                  href: "#workflow",
                },
                {
                  title: "Auditable",
                  copy: "Every request, decision and policy evaluation is written to an append-only ledger your finance team can inspect.",
                  art: "auditable" as const,
                  href: "#security",
                },
              ].map((item, index) => (
                <div
                  key={item.title}
                  className={`py-9 md:px-9 ${index > 0 ? "border-t border-white/10 md:border-l md:border-t-0" : "md:pl-0"}`}
                >
                  <div className="h-[90px]">
                    <PrincipleArt kind={item.art} />
                  </div>
                  <h3 className="mt-8 text-[26px] font-medium tracking-[-0.035em]">{item.title}</h3>
                  <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-white/50">{item.copy}</p>
                  <a href={item.href} className="group mt-6 inline-flex items-center gap-2 border-b border-white/25 pb-1 text-[12px] font-medium text-white/85">
                    See how
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="bg-paper text-ink-900">
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-8 border-t border-ink-900/10 pt-5 md:grid-cols-[160px_1fr]">
              <SectionLabel>Workflow</SectionLabel>
              <div>
                <h2 className="max-w-4xl text-[clamp(2.6rem,4.8vw,4.05rem)] font-medium leading-[1.0] tracking-[-0.05em]">
                  One request. One durable path.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-ink-900/55">
                  ProcureFlow evaluates the policy once, creates the exact approval chain and holds the
                  state until a decision is made. Every step is visible to the requester, the approver and
                  finance.
                </p>
              </div>
            </div>

            <div className="mt-14 grid border-t border-ink-900/10 md:grid-cols-5">
              {STEPS.map((step, index) => (
                <div
                  key={step.label}
                  className={`relative py-6 md:px-5 ${index > 0 ? "border-t border-ink-900/10 md:border-l md:border-t-0" : "md:pl-0"}`}
                >
                  <span className="absolute -top-[5px] left-0 h-[9px] w-[9px] border border-ink-900/20 bg-paper md:left-5" />
                  <span className="font-mono text-[9px] tracking-[0.16em] text-ink-900/35">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-5 text-[22px] font-medium tracking-[-0.03em]">{step.label}</h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-900/50">{step.body}</p>
                  <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-brand-600">
                    {step.meta}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="border border-ink-900/15 bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between border-b border-ink-900/10 pb-3">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-brand-600" />
                    <span className="mono-label text-ink-900/45">Request detail</span>
                  </div>
                  <span className="border border-emerald-600/20 bg-emerald-50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-emerald-700">
                    PO issued
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[17px] font-medium tracking-[-0.02em]">MacBooks for platform team</p>
                    <p className="mt-1 text-[11px] text-ink-900/40">Engineering · Riley Requester · rev 1</p>
                  </div>
                  <p className="font-mono text-[14px] font-medium">$2,900.00</p>
                </div>
                <div className="mt-4 overflow-hidden border border-ink-900/10">
                  <div className="grid grid-cols-[1fr_44px_90px_90px] bg-ink-900/[0.025] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-900/35">
                    <span>Description</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Unit</span>
                    <span className="text-right">Total</span>
                  </div>
                  <div className="grid grid-cols-[1fr_44px_90px_90px] border-t border-ink-900/10 px-3 py-3 text-[11px]">
                    <span className="truncate pr-2">14&quot; developer laptop, 32GB RAM</span>
                    <span className="text-right font-mono">2</span>
                    <span className="text-right font-mono">$1,450.00</span>
                    <span className="text-right font-mono">$2,900.00</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Vendor", "Northwind Office Supply"],
                    ["Policy", "Standard review"],
                    ["ERP reference", "CSV-PO-2026-0001"],
                  ].map(([label, value]) => (
                    <div key={label} className="border border-ink-900/10 px-3 py-2">
                      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-900/35">{label}</p>
                      <p className="mt-1 truncate text-[11px] text-ink-900/70">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-ink-900/10 pt-3">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-900/30">
                    Workflow · purchase-request-4f2c
                  </span>
                  <span className="font-mono text-[9px] text-brand-600">completed</span>
                </div>
              </div>

              <div className="border border-ink-900/15 bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between border-b border-ink-900/10 pb-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-brand-600" />
                    <span className="mono-label text-ink-900/45">Approval chain</span>
                  </div>
                  <span className="font-mono text-[9px] text-ink-900/30">2 steps</span>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    ["Step 1", "Approver", "Avery Approver", "Approved · within hardware budget"],
                    ["Step 2", "Finance", "Finley Finance", "Approved · budget confirmed"],
                  ].map(([step, role, actor, comment]) => (
                    <div key={step} className="flex gap-3">
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center border border-emerald-600/25 bg-emerald-50">
                        <Check className="h-3 w-3 text-emerald-700" />
                      </span>
                      <div className="min-w-0 flex-1 border-b border-ink-900/10 pb-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12px] font-medium">
                            {role} · {actor}
                          </p>
                          <span className="font-mono text-[9px] text-ink-900/30">{step}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-ink-900/45">{comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-l-2 border-brand-500 bg-brand-50 px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-brand-700">Audit summary</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-900/55">
                    Policy evaluated against three rules. Both roles accepted. PO generated and synced.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Controls */}
        <section id="controls" className="bg-brand-500 text-white">
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-8 border-t border-white/25 pt-5 md:grid-cols-[160px_1fr]">
              <SectionLabel light>Controls</SectionLabel>
              <div>
                <h2 className="max-w-4xl text-[clamp(2.6rem,4.8vw,4.05rem)] font-medium leading-[1.0] tracking-[-0.05em]">
                  Built for spend you can defend.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-white/70">
                  The policy engine is deterministic, testable and visible. Finance sets the rules; the
                  system applies them the same way on every request.
                </p>
              </div>
            </div>

            <div className="mt-14 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="border border-white/25 bg-ink-900 p-5 font-mono text-[11px] leading-relaxed shadow-[0_24px_80px_-30px_rgba(0,0,0,0.6)] sm:p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <span className="text-[9px] uppercase tracking-[0.16em] text-white/35">policy / standard.yaml</span>
                  <span className="text-[9px] text-brand-300">active</span>
                </div>
                <pre className="mt-4 overflow-x-auto text-white/60">
{`rule "low_value"
  when amount <= 1_000
  approve auto
  issue po

rule "standard"
  when amount <= 10_000
  approve manager, finance
  sla 24h

rule "high_risk_vendor"
  when vendor.risk == "HIGH"
  approve compliance
  sla 48h`}
                </pre>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[9px] text-white/30">
                  <span>evaluated for every request</span>
                  <span className="text-emerald-300/70">deterministic</span>
                </div>
              </div>

              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {CONTROLS.map(([title, copy]) => (
                  <div key={title} className="border-t border-white/25 pt-4">
                    <p className="text-[13px] font-medium">{title}</p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-white/60">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Teams */}
        <section className="bg-ink-900 text-white">
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-24">
            <div className="border-t border-white/10 pt-5">
              <SectionLabel light>Use cases</SectionLabel>
            </div>
            <div className="mt-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <h2 className="max-w-4xl text-[clamp(2.6rem,4.8vw,4.05rem)] font-medium leading-[1.0] tracking-[-0.05em]">
                Every team. One workflow.
              </h2>
              <a href="#controls" className="group inline-flex items-center gap-2 text-[12px] font-medium text-white/60">
                Explore controls
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </div>

            <div className="mt-12 border-t border-white/10">
              {TEAMS.map((team) => (
                <a
                  key={team.name}
                  href="#workflow"
                  className="group grid gap-3 border-b border-white/10 py-6 transition-colors hover:bg-white/[0.025] md:grid-cols-[1.1fr_1fr_1fr_170px_24px] md:items-center md:gap-8"
                >
                  <h3 className="text-[26px] font-medium tracking-[-0.035em] text-white/90">{team.name}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-white/40">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1 w-1 bg-brand-500" />
                      {team.inputs}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-white/40">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1 w-1 bg-brand-500" />
                      {team.policy}
                    </span>
                  </div>
                  <span className="text-[11px] text-white/35">{team.outcome}</span>
                  <ArrowUpRight className="h-4 w-4 text-white/25 transition group-hover:text-brand-400" />
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="bg-paper text-ink-900">
          <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-8 border-t border-ink-900/10 pt-5 md:grid-cols-[160px_1fr]">
              <SectionLabel>Security</SectionLabel>
              <div>
                <h2 className="max-w-4xl text-[clamp(2.6rem,4.8vw,4.05rem)] font-medium leading-[1.0] tracking-[-0.05em]">
                  Built for the audit committee.
                </h2>
                <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-ink-900/55">
                  Procurement is a control system. ProcureFlow treats access, approvals and records as
                  first-class parts of the product — not a reporting layer bolted on afterwards.
                </p>
              </div>
            </div>

            <div className="mt-14 grid border-t border-ink-900/10 sm:grid-cols-2 lg:grid-cols-3">
              {SECURITY.map(([title, copy], index) => (
                <div
                  key={title}
                  className={`py-6 sm:px-6 ${index >= 3 ? "border-t border-ink-900/10" : ""} ${index % 3 !== 0 ? "lg:border-l lg:border-ink-900/10" : "lg:pl-0"} ${index % 2 !== 0 ? "sm:border-l sm:border-ink-900/10" : "sm:pl-0"} ${index >= 2 ? "sm:border-t sm:border-ink-900/10" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-brand-600" />
                    <p className="text-[14px] font-medium">{title}</p>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-900/50">{copy}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 grid gap-4 border border-ink-900/10 bg-white p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-6">
              <div className="flex h-10 w-10 items-center justify-center bg-ink-900">
                <Fingerprint className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[13px] font-medium">Every decision has a name, a reason and a timestamp.</p>
                <p className="mt-1 text-[11px] text-ink-900/45">
                  Audit events are append-only and exportable. Approvals cannot be edited after the fact.
                </p>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-700">
                audit-ready
              </span>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden bg-ink-900 text-white">
          <div className="pointer-events-none absolute inset-0 landing-grid opacity-60" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-[420px] w-[760px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(47,109,246,0.22),transparent)]" />
          <div className="relative mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-28">
            <div className="border-t border-white/10 pt-5">
              <SectionLabel light>Get started</SectionLabel>
            </div>
            <div className="mt-10 flex flex-col justify-between gap-10 lg:flex-row lg:items-end">
              <div>
                <h2 className="max-w-3xl text-[clamp(3rem,5.6vw,5rem)] font-medium leading-[0.96] tracking-[-0.055em]">
                  Put procurement
                  <br />
                  on rails.
                </h2>
                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/50">
                  Policy-driven intake, durable approvals and purchase orders your finance team can trust.
                  Start with the demo dataset, then make the rules yours.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="group inline-flex h-11 items-center gap-3 bg-brand-500 px-5 text-[14px] font-medium text-white transition hover:bg-brand-400"
                >
                  Open the app
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex h-11 items-center border border-white/20 px-5 text-[14px] font-medium text-white/75 transition hover:border-white/40 hover:text-white"
                >
                  Revisit the workflow
                </a>
              </div>
            </div>

            <div className="mt-16 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
              {[
                [Timer, "Approvals with SLAs", "Timers and escalation are part of the workflow."],
                [ReceiptText, "POs with references", "Every PO gets a number and an ERP handoff."],
                [LockKeyhole, "Controls by default", "RBAC, segregation of duties and audit events."],
              ].map(([Icon, title, copy]) => {
                const Component = Icon as typeof Timer;
                return (
                  <div key={title as string} className="flex items-start gap-3">
                    <Component className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                    <div>
                      <p className="text-[12px] font-medium text-white/80">{title as string}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/35">{copy as string}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-ink-900 text-white">
        <div className="mx-auto max-w-[1320px] px-5 py-14 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Logo tone="dark" />
              <p className="mt-4 max-w-xs text-[12px] leading-relaxed text-white/40">
                Procurement orchestration for teams that need every purchase to move — and every
                decision to hold up.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Durable", "Auditable", "Configurable"].map((item) => (
                  <span key={item} className="border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            {[
              ["Platform", [["Workflow", "#workflow"], ["Controls", "#controls"], ["Security", "#security"], ["Open app", "/login"]]],
              ["Company", [["Overview", "#platform"], ["Use cases", "#workflow"], ["Demo", "/login"], ["Health", "/api/health"]]],
              ["Resources", [["Documentation", "/login"], ["Request access", "/login"], ["Sign in", "/login"], ["Status", "/api/health"]]],
            ].map(([title, links]) => (
              <div key={title as string}>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">{title as string}</p>
                <ul className="mt-4 space-y-2.5">
                  {(links as string[][]).map(([label, href]) => (
                    <li key={label}>
                      <Link href={href} className="text-[12px] text-white/55 transition hover:text-white">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-5 text-[10px] text-white/30 sm:flex-row">
            <span>© 2026 ProcureFlow. All rights reserved.</span>
            <span className="font-mono uppercase tracking-[0.12em]">Built for the work between request and receipt.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
