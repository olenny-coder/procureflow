import { CircleCheck, Clock3, FileText, ShieldCheck } from "lucide-react";

export function HeroRequestPanel() {
  return (
    <div className="relative">
      <div className="absolute -inset-x-6 -inset-y-4 hidden border border-white/[0.06] sm:block" />
      <div className="relative border border-white/15 bg-ink-800/90 p-4 shadow-[0_30px_80px_-18px_rgba(0,0,0,0.7)] backdrop-blur sm:p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="mono-label text-white/40">Request / PR-2041</span>
          <span className="inline-flex items-center gap-1.5 border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-200">
            <span className="h-1 w-1 bg-amber-300" />
            In approval
          </span>
        </div>

        <div className="pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[17px] font-medium tracking-[-0.02em] text-white">
                MacBooks for platform team
              </p>
              <p className="mt-1 text-xs text-white/45">Engineering · 2 line items</p>
            </div>
            <p className="font-mono text-sm text-white">$2,900.00</p>
          </div>
          <div className="mt-3 flex items-center gap-2 border border-white/10 bg-black/20 px-3 py-2">
            <span className="flex h-6 w-6 items-center justify-center bg-white/10 font-mono text-[9px] text-white/70">
              NW
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-white/80">Northwind Office Supply</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-emerald-300/80">
                Approved · low risk
              </p>
            </div>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300/70" />
          </div>
        </div>

        <div className="mt-4 border-l-2 border-brand-400 bg-brand-500/[0.07] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="mono-label text-brand-300">Policy / standard review</span>
            <span className="font-mono text-[9px] text-white/35">auto</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-white/60">
            <span>Manager</span>
            <span className="text-white/25">-&gt;</span>
            <span>Finance</span>
            <span className="text-white/25">-&gt;</span>
            <span className="text-white/30">PO</span>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2.5 border border-white/10 px-3 py-2">
            <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-white/80">Avery Approver</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/35">
                Manager · approved
              </p>
            </div>
            <span className="font-mono text-[9px] text-white/30">24h</span>
          </div>
          <div className="flex items-center gap-2.5 border border-brand-400/40 bg-brand-500/[0.06] px-3 py-2">
            <Clock3 className="h-3.5 w-3.5 shrink-0 text-brand-300" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-white/80">Finley Finance</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-brand-300/80">
                Finance · waiting
              </p>
            </div>
            <span className="font-mono text-[9px] text-brand-300/70">12h left</span>
          </div>
        </div>

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="mono-label text-white/35">Audit trail</span>
            <span className="font-mono text-[9px] text-white/25">append-only</span>
          </div>
          <div className="space-y-1.5 font-mono text-[9px] leading-relaxed text-white/40">
            <p className="flex items-center justify-between gap-2">
              <span className="text-white/55">REQUEST_SUBMITTED</span>
              <span>Riley · 09:14</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span className="text-white/55">POLICY_EVALUATED</span>
              <span>system · 09:14</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span className="text-white/55">APPROVAL_GRANTED</span>
              <span>Avery · 10:02</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">
            <FileText className="h-3 w-3" />
            Durable workflow
          </span>
          <span className="font-mono text-[9px] text-emerald-300/70">run 7f2c...9a1</span>
        </div>
      </div>
    </div>
  );
}
