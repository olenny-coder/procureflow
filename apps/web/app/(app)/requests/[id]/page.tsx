import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  History,
  ReceiptText,
  ShieldAlert,
  Workflow,
  XCircle,
} from "lucide-react";
import {
  formatDate,
  formatMoney,
  formatRelative,
  CATEGORY_LABELS,
  type TaskStatus,
} from "@procureflow/shared/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { RequestActions } from "@/components/requests/request-actions";
import { getRequestDetail } from "@/lib/queries";
import { requirePageUser } from "@/lib/session";
import { queryPurchaseRequestState } from "@/lib/orchestration";
import { RISK_STYLES, cn, humanize } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TASK_ICONS: Record<TaskStatus, typeof CheckCircle2> = {
  PENDING: Clock3,
  ESCALATED: ShieldAlert,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  CHANGES_REQUESTED: History,
  CANCELLED: XCircle,
};

function taskTone(status: TaskStatus): string {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-600 ring-emerald-100";
  if (status === "REJECTED" || status === "CANCELLED") return "bg-rose-50 text-rose-500 ring-rose-100";
  if (status === "CHANGES_REQUESTED") return "bg-orange-50 text-orange-500 ring-orange-100";
  if (status === "ESCALATED") return "bg-amber-50 text-amber-600 ring-amber-100";
  return "bg-slate-50 text-slate-500 ring-slate-200";
}

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser();
  const detail = await getRequestDetail(params.id);
  if (!detail) notFound();
  if (user.role === "REQUESTER" && detail.requesterId !== user.id) {
    notFound();
  }

  const workflowState =
    detail.workflowId && !["DRAFT", "CANCELLED"].includes(detail.status)
      ? await queryPurchaseRequestState(detail.workflowId)
      : null;

  const currentTask = detail.approvalTasks.find(
    (task) => task.stepOrder === detail.currentStep && ["PENDING", "ESCALATED"].includes(task.status),
  );
  const canAct =
    Boolean(currentTask) &&
    user.id !== detail.requesterId &&
    (user.role === "ADMIN" || currentTask?.approverRole === user.role);
  const isOwner = detail.requesterId === user.id;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {detail.title}
            <StatusBadge status={detail.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{detail.requesterName}</span>
            <span className="text-slate-300">·</span>
            <span>{detail.department}</span>
            <span className="text-slate-300">·</span>
            <span>{CATEGORY_LABELS[detail.category] ?? humanize(detail.category)}</span>
            <span className="text-slate-300">·</span>
            <span>Revision {detail.revision}</span>
          </span>
        }
        actions={
          <div className="flex flex-col items-end gap-2">
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatMoney(detail.totalAmountCents, detail.currency)}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isOwner && ["DRAFT", "CHANGES_REQUESTED"].includes(detail.status) ? (
                <Link href={`/requests/${detail.id}/edit`}>
                  <Button variant="outline" size="sm">
                    Edit request
                  </Button>
                </Link>
              ) : null}
              <RequestActions requestId={detail.id} status={detail.status} isOwner={isOwner} />
            </div>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                Request details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Vendor</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{detail.vendorName}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusBadge status={detail.vendorStatus} />
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                        RISK_STYLES[detail.vendorRiskLevel],
                      )}
                    >
                      {detail.vendorRiskLevel} risk
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Urgency</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{humanize(detail.urgency)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {formatDate(detail.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Submitted</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {detail.submittedAt ? formatDate(detail.submittedAt) : "Not submitted"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Updated {formatRelative(detail.updatedAt)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Business justification
                </p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {detail.justification}
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Line items</p>
                  <p className="text-xs text-slate-500">{detail.items.length} items</p>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Description</TH>
                        <TH className="text-right">Qty</TH>
                        <TH className="text-right">Unit price</TH>
                        <TH className="text-right">Line total</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {detail.items.map((item) => (
                        <TR key={item.id}>
                          <TD className="font-medium text-slate-800">{item.description}</TD>
                          <TD className="text-right tabular-nums">{item.quantity}</TD>
                          <TD className="text-right tabular-nums">
                            {formatMoney(item.unitPriceCents, detail.currency)}
                          </TD>
                          <TD className="text-right font-medium tabular-nums text-slate-900">
                            {formatMoney(item.totalPriceCents, detail.currency)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-4 text-sm">
                  <span className="text-slate-500">Total</span>
                  <span className="text-base font-semibold tabular-nums text-slate-900">
                    {formatMoney(detail.totalAmountCents, detail.currency)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-slate-400" />
                  Approval chain
                </CardTitle>
                <p className="mt-0.5 text-sm text-slate-500">
                  Managed by durable workflow <span className="font-mono text-xs">{detail.workflowId}</span>
                </p>
              </div>
              <Badge tone="brand">Step {detail.currentStep || 0}</Badge>
            </CardHeader>
            <CardContent>
              {detail.approvalTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  The approval chain is created after policy evaluation. Submit the request to start it.
                </div>
              ) : (
                <ol className="relative space-y-5">
                  <span className="absolute bottom-3 left-[19px] top-3 w-px bg-slate-200" aria-hidden />
                  {detail.approvalTasks.map((task) => {
                    const Icon = TASK_ICONS[task.status] ?? Clock3;
                    const active = task.stepOrder === detail.currentStep && task.status === "PENDING";
                    return (
                      <li key={task.id} className="relative flex gap-3">
                        <span
                          className={cn(
                            "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1",
                            taskTone(task.status),
                            active && "ring-2 ring-amber-300",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {task.approverRole ? humanize(task.approverRole) : "Approval"} approval
                              </p>
                              <span className="text-xs text-slate-400">Step {task.stepOrder}</span>
                              {task.escalationCount > 0 ? <Badge tone="amber">Escalated</Badge> : null}
                            </div>
                            <StatusBadge status={task.status} />
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="h-3.5 w-3.5" />
                              Due {formatDate(task.dueAt)}
                            </span>
                            {task.actedAt ? (
                              <span>
                                Acted {formatRelative(task.actedAt)}
                                {task.actedByName ? ` by ${task.actedByName}` : ""}
                              </span>
                            ) : null}
                          </div>
                          {task.comment ? (
                            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              “{task.comment}”
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {canAct && currentTask ? (
                <div className="mt-5">
                  <ApprovalActions
                    taskId={currentTask.id}
                    requestId={detail.id}
                    role={currentTask.approverRole}
                  />
                </div>
              ) : null}

              {detail.status === "CHANGES_REQUESTED" && isOwner ? (
                <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  <p className="font-semibold">An approver requested changes.</p>
                  <p className="mt-1 text-orange-700">
                    Update the request if needed, then use <strong>Resubmit for approval</strong>. The same
                    workflow resumes with a new policy evaluation.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-400" />
                Audit trail
              </CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                Append-only events written by API routes and worker activities.
              </p>
            </CardHeader>
            <CardContent>
              {detail.audit.length === 0 ? (
                <p className="text-sm text-slate-500">No audit events yet.</p>
              ) : (
                <ol className="relative space-y-4">
                  <span className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" aria-hidden />
                  {detail.audit.map((event) => (
                    <li key={event.id} className="relative flex gap-3">
                      <span className="relative z-10 mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">{humanize(event.action)}</p>
                          <p className="text-xs text-slate-400">{formatDate(event.createdAt)}</p>
                        </div>
                        <p className="text-xs text-slate-500">{event.actorName ?? "System"}</p>
                        {event.metadata && Object.keys(event.metadata).length > 0 ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-slate-600">
                              Metadata
                            </summary>
                            <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-slate-200">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-slate-400" />
                Workflow execution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Workflow ID</p>
                <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-slate-700">
                  {detail.workflowId ?? "Not started"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">DB state</p>
                  <p className="mt-1 text-sm font-medium">{humanize(detail.status)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Workflow</p>
                  <p className="mt-1 text-sm font-medium">
                    {workflowState ? humanize(workflowState.status) : "Unavailable"}
                  </p>
                </div>
              </div>
              {workflowState ? (
                <>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Policy evaluation
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">
                      {workflowState.policyExplanation || "Not evaluated yet."}
                    </p>
                  </div>
                  {workflowState.pendingTask ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      Waiting on <strong>{workflowState.pendingTask.role}</strong> · step{" "}
                      {workflowState.pendingTask.stepOrder} · due{" "}
                      {formatRelative(workflowState.pendingTask.dueAt)}
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Workflow audit summary
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {workflowState.auditSummary.slice(-6).map((line, index) => (
                        <li key={`${line}-${index}`} className="text-[11px] leading-relaxed text-slate-500">
                          {line.replace(/^[0-9T:.\-Z]+ /, "")}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-slate-500">
                  Workflow state is queried live from the orchestration service. If the worker or server is
                  offline, the PostgreSQL read model above remains authoritative.
                </p>
              )}
            </CardContent>
          </Card>

          {detail.purchaseOrder ? (
            <Card className="border-emerald-200">
              <CardHeader className="border-emerald-100">
                <CardTitle className="flex items-center gap-2 text-emerald-900">
                  <ReceiptText className="h-4 w-4 text-emerald-600" />
                  Purchase order
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {detail.purchaseOrder.poNumber}
                  </p>
                  <StatusBadge status={detail.purchaseOrder.status} />
                </div>
                <div className="text-xs text-slate-500">
                  <p>Issued {formatDate(detail.purchaseOrder.issuedAt)}</p>
                  {detail.purchaseOrder.erpReference ? (
                    <p className="mt-1">
                      ERP reference:{" "}
                      <span className="font-mono text-slate-700">{detail.purchaseOrder.erpReference}</span>
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                Vendor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{detail.vendorName}</p>
                <StatusBadge status={detail.vendorStatus} />
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                <p>{detail.vendorContactEmail}</p>
                {detail.vendorWebsite ? (
                  <a
                    href={detail.vendorWebsite}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700"
                  >
                    {detail.vendorWebsite.replace(/^https?:\/\//, "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              {detail.vendorRiskSummary ? (
                <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                  <p className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Risk summary</p>
                  {detail.vendorRiskSummary}
                </div>
              ) : null}
              <Link href="/vendors">
                <Button variant="outline" size="sm" className="w-full">
                  Vendor directory
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
