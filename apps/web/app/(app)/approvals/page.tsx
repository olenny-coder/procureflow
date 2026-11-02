import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckSquare, Clock3, Inbox, ShieldAlert } from "lucide-react";
import { formatMoney, formatRelative } from "@procureflow/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { getPendingApprovals } from "@/lib/queries";
import { requirePageUser } from "@/lib/session";
import { RISK_STYLES, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await requirePageUser();

  if (user.role === "REQUESTER") {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Approvals are handled by approvers, finance and admins"
          description="Your account can submit and track requests. Sign in with an approver account to act on approval tasks."
          action={
            <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Back to dashboard
            </Link>
          }
        />
      </Card>
    );
  }

  const pending = await getPendingApprovals(user, 100);
  const escalated = pending.filter((item) => item.escalated).length;
  const overdue = pending.filter((item) => new Date(item.dueAt).getTime() < Date.now()).length;
  const totalValue = pending.reduce((sum, item) => sum + item.totalAmountCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval inbox"
        description={
          user.role === "ADMIN"
            ? "Pending approval tasks across all roles, ordered by due date."
            : `Pending ${user.role.toLowerCase()} approval tasks, ordered by due date.`
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Inbox className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Pending tasks</p>
            <p className="text-lg font-semibold">{pending.length}</p>
          </div>
        </div>
        <div className="surface flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Overdue / escalated</p>
            <p className="text-lg font-semibold">
              {overdue} <span className="text-sm font-normal text-slate-400">/ {escalated}</span>
            </p>
          </div>
        </div>
        <div className="surface flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Value awaiting decision</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(totalValue)}</p>
          </div>
        </div>
      </div>

      {pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckSquare}
            title="Inbox zero"
            description="No approval tasks are waiting on you. New tasks appear here the moment policy routes them."
            action={
              <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Back to dashboard
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {pending.map((item) => {
            const dueInPast = new Date(item.dueAt).getTime() < Date.now();
            return (
              <Card key={item.taskId} className="overflow-hidden">
                <CardHeader className="bg-slate-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="line-clamp-2 text-[15px]">{item.title}</CardTitle>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.requesterName} · {item.department} · step {item.stepOrder}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-semibold tabular-nums">
                      {formatMoney(item.totalAmountCents, item.currency)}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      {item.vendorName}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                        RISK_STYLES[item.vendorRiskLevel],
                      )}
                    >
                      {item.vendorRiskLevel} risk
                    </span>
                    <StatusBadge status={item.status} />
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                        dueInPast
                          ? "bg-rose-50 text-rose-700 ring-rose-200"
                          : "bg-slate-50 text-slate-600 ring-slate-200",
                      )}
                    >
                      <Clock3 className="h-3 w-3" />
                      {dueInPast ? "Overdue" : "Due"} {formatRelative(item.dueAt)}
                    </span>
                    {item.escalated ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                        Escalated
                      </span>
                    ) : null}
                  </div>

                  <ApprovalActions taskId={item.taskId} requestId={item.requestId} role={null} />

                  <Link
                    href={`/requests/${item.requestId}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Open request detail
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
