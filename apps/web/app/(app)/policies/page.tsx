import { ShieldX, SlidersHorizontal } from "lucide-react";
import { formatMoney } from "@procureflow/shared/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { PolicyEditor, type EditablePolicy } from "@/components/policies/policy-editor";
import { listPolicies } from "@/lib/queries";
import { requirePageUser } from "@/lib/session";
import { humanize } from "@/lib/utils";

export const dynamic = "force-dynamic";

function summarizeConditions(policy: EditablePolicy): string[] {
  const conditions = policy.conditions;
  const parts: string[] = [];
  const min = conditions.minAmountCents;
  const max = conditions.maxAmountCents;
  if (typeof min === "number" && typeof max === "number") {
    parts.push(`${formatMoney(min)} - ${formatMoney(max)}`);
  } else if (typeof min === "number") {
    parts.push(`>= ${formatMoney(min)}`);
  } else if (typeof max === "number") {
    parts.push(`<= ${formatMoney(max)}`);
  }
  if (Array.isArray(conditions.departments) && conditions.departments.length > 0) {
    parts.push(`Dept: ${conditions.departments.join(", ")}`);
  }
  if (Array.isArray(conditions.categories) && conditions.categories.length > 0) {
    parts.push(`Category: ${conditions.categories.join(", ")}`);
  }
  if (Array.isArray(conditions.vendorRiskLevels) && conditions.vendorRiskLevels.length > 0) {
    parts.push(`Risk: ${conditions.vendorRiskLevels.join(", ")}`);
  }
  if (Array.isArray(conditions.vendorStatuses) && conditions.vendorStatuses.length > 0) {
    parts.push(`Vendor: ${conditions.vendorStatuses.join(", ")}`);
  }
  if (Array.isArray(conditions.urgencies) && conditions.urgencies.length > 0) {
    parts.push(`Urgency: ${conditions.urgencies.join(", ")}`);
  }
  return parts;
}

export default async function PoliciesPage() {
  const user = await requirePageUser();

  if (user.role !== "ADMIN") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <ShieldX className="h-5 w-5" />
          </div>
          <p className="mt-3 font-semibold">Admin access required</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Procurement policies change approval routing for everyone. Only admins can view or edit them.
          </p>
        </CardContent>
      </Card>
    );
  }

  const policies = await listPolicies();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy engine"
        description="Rules compose the approval chain from amount, department, vendor risk/status, urgency and category. Evaluation is deterministic and unit-tested."
        actions={<PolicyEditor />}
      />

      <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4 text-xs leading-relaxed text-brand-900">
        <span className="font-semibold">Evaluation semantics:</span> enabled rules whose conditions all
        match are merged. Approvers are de-duplicated by role and executed manager {"->"} finance {"->"} admin. An
        empty approver list means auto-approve. If no rule matches, the request falls back to admin review.
        Lower priority numbers sort first.
      </div>

      <div className="grid gap-4">
        {policies.map((policy) => {
          const conditions = summarizeConditions(policy);
          return (
            <Card key={policy.id} className={policy.enabled ? "" : "opacity-70"}>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{policy.name}</CardTitle>
                    <Badge tone={policy.enabled ? "emerald" : "slate"}>
                      {policy.enabled ? "Active" : "Disabled"}
                    </Badge>
                    <Badge tone="slate">Priority {policy.priority}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{policy.description || "No description"}</p>
                </div>
                <PolicyEditor policy={policy} />
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Conditions
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {conditions.length === 0 ? (
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                        All purchase requests
                      </span>
                    ) : (
                      conditions.map((condition) => (
                        <span
                          key={condition}
                          className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700"
                        >
                          {condition}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Approval chain
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {policy.approvers.length === 0 ? (
                      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        Auto-approve {"->"} PO
                      </span>
                    ) : (
                      policy.approvers.map((approver, index) => (
                        <span key={`${approver.role}-${index}`} className="flex items-center gap-1.5">
                          {index > 0 ? <span className="text-slate-300">{"->"}</span> : null}
                          <span className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                            {humanize(approver.role)} - {approver.dueInHours}h
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Changes apply to new policy evaluations. In-flight workflows keep the chain they were created with.
      </div>
    </div>
  );
}
