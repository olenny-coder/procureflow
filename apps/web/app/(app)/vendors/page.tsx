import { Building2, Globe2, ShieldCheck, ShieldAlert, Users } from "lucide-react";
import { formatDate } from "@procureflow/shared/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { VendorForm } from "@/components/vendors/vendor-form";
import { VendorReviewActions } from "@/components/vendors/vendor-review-actions";
import { listVendors } from "@/lib/queries";
import { requirePageUser } from "@/lib/session";
import { RISK_STYLES, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const user = await requirePageUser();
  const vendors = await listVendors();
  const canReview = user.role === "ADMIN" || user.role === "FINANCE";
  const approved = vendors.filter((vendor) => vendor.status === "APPROVED").length;
  const pending = vendors.filter((vendor) => vendor.status === "PENDING_REVIEW").length;
  const blocked = vendors.filter((vendor) => vendor.status === "BLOCKED").length;
  const highRisk = vendors.filter((vendor) => vendor.riskLevel === "HIGH").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor directory"
        description="Vendor onboarding, risk ratings and compliance review. High-risk or unapproved vendors add compliance steps to purchases."
        actions={<VendorForm />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Approved vendors", value: approved, icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-600" },
          { label: "Pending review", value: pending, icon: Users, tone: "bg-amber-50 text-amber-600" },
          { label: "Blocked", value: blocked, icon: ShieldAlert, tone: "bg-rose-50 text-rose-600" },
          { label: "High risk", value: highRisk, icon: Building2, tone: "bg-violet-50 text-violet-600" },
        ].map((stat) => (
          <div key={stat.label} className="surface flex items-center gap-3 p-4">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", stat.tone)}>
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="text-lg font-semibold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>All vendors</CardTitle>
            <p className="mt-0.5 text-sm text-slate-500">
              {vendors.length} vendor{vendors.length === 1 ? "" : "s"} · onboarding decisions run as a durable
              workflow.
            </p>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5" />
            Compliance workflow
          </div>
        </CardHeader>

        {vendors.length === 0 ? (
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold">No vendors yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Add your first vendor profile to start submitting purchase requests.
            </p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Vendor</TH>
                <TH>Status</TH>
                <TH>Risk</TH>
                <TH className="hidden md:table-cell">Contact</TH>
                <TH className="hidden lg:table-cell">Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {vendors.map((vendor) => (
                <TR key={vendor.id}>
                  <TD>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-[11px] font-semibold text-white">
                        {vendor.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{vendor.name}</p>
                        {vendor.website ? (
                          <a
                            href={vendor.website}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                          >
                            <Globe2 className="h-3 w-3" />
                            {vendor.website.replace(/^https?:\/\//, "")}
                          </a>
                        ) : null}
                        {vendor.riskSummary ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600">
                              Risk summary
                            </summary>
                            <p className="mt-1 max-w-md rounded-lg bg-slate-50 p-2 text-xs leading-relaxed text-slate-600">
                              {vendor.riskSummary}
                            </p>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <StatusBadge status={vendor.status} />
                  </TD>
                  <TD>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                        RISK_STYLES[vendor.riskLevel],
                      )}
                    >
                      {vendor.riskLevel}
                    </span>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <p className="text-sm text-slate-700">{vendor.contactEmail}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {vendor.taxId ?? "No tax ID"}
                    </p>
                  </TD>
                  <TD className="hidden whitespace-nowrap text-xs text-slate-500 lg:table-cell">
                    {formatDate(vendor.createdAt)}
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {vendor.createdByName ?? "System"}
                    </p>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end">
                      <VendorReviewActions
                        vendorId={vendor.id}
                        status={vendor.status}
                        riskLevel={vendor.riskLevel}
                        canReview={canReview}
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">How vendor onboarding works:</span> a new vendor
        starts in <strong>Draft</strong>. A finance or admin user starts the onboarding workflow
        (<code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">vendor-onboarding-&lt;id&gt;</code>),
        which waits for a compliance decision signal. Approved vendors can be used immediately; high-risk
        approvals add an admin/compliance step to purchase requests.
      </div>
    </div>
  );
}
