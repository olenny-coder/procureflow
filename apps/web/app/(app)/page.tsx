import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  Plus,
  ReceiptText,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { formatMoney, formatRelative } from "@procureflow/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { RISK_STYLES, cn, humanize } from "@/lib/utils";
import { requirePageUser } from "@/lib/session";
import {
  getDashboardStats,
  getPendingApprovals,
  getRecentAudit,
  getRecentAuditForRequester,
  getRecentPurchaseOrders,
  listMyRequests,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function AuditFeed({
  items,
}: {
  items: Awaited<ReturnType<typeof getRecentAudit>>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Audit events appear here as requests move through approvals and POs are issued."
      />
    );
  }
  return (
    <ol className="relative space-y-4 px-5 py-4">
      <span className="absolute bottom-5 left-[29px] top-5 w-px bg-slate-200" aria-hidden />
      {items.map((item) => (
        <li key={item.id} className="relative flex gap-3">
          <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">{humanize(item.action)}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.actorName ?? "System"} · {formatRelative(item.createdAt)}
            </p>
          </div>
          {item.entityType === "PURCHASE_REQUEST" ? (
            <Link
              href={`/requests/${item.entityId}`}
              className="mt-1 shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              View
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default async function DashboardPage() {
  const user = await requirePageUser();
  const canSeeAllAudit = user.role === "ADMIN" || user.role === "FINANCE";

  const [requests, pending, purchaseOrders, audit, stats] = await Promise.all([
    listMyRequests(user.id, 8),
    getPendingApprovals(user, 6),
    getRecentPurchaseOrders(6),
    canSeeAllAudit ? getRecentAudit(8) : getRecentAuditForRequester(user.id, 8),
    getDashboardStats(user),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description="Here is what is moving through procurement right now."
        actions={
          <Link href="/requests/new">
            <Button>
              <Plus className="h-4 w-4" />
              New request
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Open requests"
          value={String(stats.openRequests)}
          hint="Your drafts, requests in approval and changes requested."
          tone="brand"
        />
        <StatCard
          icon={Inbox}
          label="Waiting on you"
          value={String(stats.pendingApprovals)}
          hint={
            user.role === "ADMIN"
              ? "All pending approvals visible to admins, including escalations."
              : `Pending ${user.role === "APPROVER" ? "manager" : user.role.toLowerCase()} approvals.`
          }
          tone={stats.pendingApprovals > 0 ? "amber" : "emerald"}
        />
        <StatCard
          icon={Wallet}
          label="PO value · 30 days"
          value={formatMoney(stats.poValue30dCents)}
          hint="Value of purchase orders issued in the last 30 days."
          tone="sky"
        />
        <StatCard
          icon={ShieldAlert}
          label="Vendors to watch"
          value={String(stats.riskyVendors)}
          hint="High-risk, pending-review or blocked vendors."
          tone={stats.riskyVendors > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>My requests</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">Everything you have submitted or drafted.</p>
            </div>
            <Link href="/requests/new" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Create request
            </Link>
          </CardHeader>
          {requests.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No requests yet"
              description="Start with a vendor and a few line items. Policy and approvals are handled automatically."
              action={
                <Link href="/requests/new">
                  <Button size="sm">
                    <Plus className="h-4 w-4" />
                    New request
                  </Button>
                </Link>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Request</TH>
                  <TH className="hidden md:table-cell">Vendor</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                  <TH className="hidden sm:table-cell">Updated</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {requests.map((request) => (
                  <TR key={request.id}>
                    <TD>
                      <Link
                        href={`/requests/${request.id}`}
                        className="line-clamp-1 font-medium text-slate-900 hover:text-brand-700"
                      >
                        {request.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {request.department}
                        {request.revision > 1 ? ` · revision ${request.revision}` : ""}
                      </p>
                    </TD>
                    <TD className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <span className="max-w-[160px] truncate">{request.vendorName}</span>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                            RISK_STYLES[request.vendorRiskLevel],
                          )}
                        >
                          {request.vendorRiskLevel}
                        </span>
                      </div>
                    </TD>
                    <TD className="font-medium tabular-nums text-slate-900">
                      {formatMoney(request.totalAmountCents, request.currency)}
                    </TD>
                    <TD>
                      <StatusBadge status={request.status} />
                    </TD>
                    <TD className="hidden whitespace-nowrap text-xs text-slate-500 sm:table-cell">
                      {formatRelative(request.updatedAt)}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/requests/${request.id}`}
                        aria-label={`Open ${request.title}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Waiting on you</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">Approvals assigned to your role.</p>
            </div>
            <Link href="/approvals" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Inbox
            </Link>
          </CardHeader>
          {pending.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Inbox zero"
              description="No approvals are waiting on you. Nice work."
              className="flex-1"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((item) => {
                const overdue = new Date(item.dueAt).getTime() < Date.now();
                return (
                  <li key={item.taskId}>
                    <Link
                      href={`/requests/${item.requestId}`}
                      className="flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50/70"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <Clock3 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.requesterName} · {formatMoney(item.totalAmountCents, item.currency)}
                        </p>
                        <p className={cn("mt-1 text-[11px] font-medium", overdue ? "text-rose-600" : "text-slate-400")}>
                          {item.escalated ? "Escalated · " : ""}
                          {overdue ? "Overdue " : "Due "}
                          {formatRelative(item.dueAt)}
                        </p>
                      </div>
                      <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent purchase orders</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">Issued after final approval.</p>
            </div>
            <ReceiptText className="h-4 w-4 text-slate-400" />
          </CardHeader>
          {purchaseOrders.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No POs issued yet"
              description="Once a request clears its approval chain, the PO number and ERP sync appear here."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>PO number</TH>
                  <TH className="hidden sm:table-cell">Request</TH>
                  <TH>Vendor</TH>
                  <TH className="hidden md:table-cell">Issued</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {purchaseOrders.map((po) => (
                  <TR key={po.id}>
                    <TD>
                      <Link href={`/requests/${po.requestId}`} className="font-mono text-xs font-semibold text-slate-900 hover:text-brand-700">
                        {po.poNumber}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatMoney(po.totalAmountCents, po.currency)}
                      </p>
                    </TD>
                    <TD className="hidden max-w-[180px] sm:table-cell">
                      <span className="line-clamp-1">{po.title}</span>
                    </TD>
                    <TD className="max-w-[140px] truncate">{po.vendorName}</TD>
                    <TD className="hidden whitespace-nowrap text-xs text-slate-500 md:table-cell">
                      {formatRelative(po.issuedAt)}
                    </TD>
                    <TD>
                      <StatusBadge status={po.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>{canSeeAllAudit ? "Audit feed" : "Your audit trail"}</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                {canSeeAllAudit ? "Append-only events across procurement." : "Events on your purchase requests."}
              </p>
            </div>
            {canSeeAllAudit ? (
              <Link href="/audit" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Full log
              </Link>
            ) : (
              <Activity className="h-4 w-4 text-slate-400" />
            )}
          </CardHeader>
          <AuditFeed items={audit} />
        </Card>
      </div>
    </div>
  );
}
