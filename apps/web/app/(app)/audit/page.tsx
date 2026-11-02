import Link from "next/link";
import { ScrollText, ShieldX } from "lucide-react";
import { formatDate } from "@procureflow/shared/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { getAuditPage } from "@/lib/queries";
import { requirePageUser } from "@/lib/session";
import { humanize } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ENTITY_TYPES = ["PURCHASE_REQUEST", "VENDOR", "POLICY", "USER"];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { entityType?: string; action?: string; page?: string };
}) {
  const user = await requirePageUser();

  if (user.role !== "ADMIN" && user.role !== "FINANCE") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <ShieldX className="h-5 w-5" />
          </div>
          <p className="mt-3 font-semibold">Audit access is restricted</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Finance and admin roles can search the append-only audit log across procurement.
          </p>
        </CardContent>
      </Card>
    );
  }

  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const pageSize = 25;
  const result = await getAuditPage({
    entityType: searchParams.entityType || undefined,
    action: searchParams.action || undefined,
    page,
    pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

  function pageHref(target: number): string {
    const params = new URLSearchParams();
    if (searchParams.entityType) params.set("entityType", searchParams.entityType);
    if (searchParams.action) params.set("action", searchParams.action);
    params.set("page", String(target));
    return `/audit?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Append-only events from API routes and worker activities. Every approval transition is attributable."
      />

      <Card>
        <CardContent className="pt-5">
          <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-56">
              <label htmlFor="entityType" className="field-label">
                Entity type
              </label>
              <Select id="entityType" name="entityType" defaultValue={searchParams.entityType ?? ""}>
                <option value="">All entities</option>
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <label htmlFor="action" className="field-label">
                Action contains
              </label>
              <Input
                id="action"
                name="action"
                defaultValue={searchParams.action ?? ""}
                placeholder="e.g. APPROVAL, PO, VENDOR"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Filter</Button>
              <Link href="/audit">
                <Button variant="outline">Reset</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Events</CardTitle>
            <p className="mt-0.5 text-sm text-slate-500">
              {result.total} event{result.total === 1 ? "" : "s"} · page {page} of {totalPages}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
            <ScrollText className="h-3.5 w-3.5" />
            Immutable
          </div>
        </CardHeader>

        {result.items.length === 0 ? (
          <CardContent className="py-12 text-center">
            <ScrollText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold">No matching events</p>
            <p className="mt-1 text-sm text-slate-500">Adjust the filters or complete a procurement action.</p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
                <TH>Actor</TH>
                <TH>Metadata</TH>
              </TR>
            </THead>
            <TBody>
              {result.items.map((event) => (
                <TR key={event.id}>
                  <TD className="whitespace-nowrap text-xs text-slate-500">
                    {formatDate(event.createdAt)}
                  </TD>
                  <TD>
                    <span className="font-medium text-slate-800">{humanize(event.action)}</span>
                  </TD>
                  <TD>
                    <p className="text-xs text-slate-500">{humanize(event.entityType)}</p>
                    {event.entityType === "PURCHASE_REQUEST" ? (
                      <Link
                        href={`/requests/${event.entityId}`}
                        className="mt-0.5 block font-mono text-[11px] text-brand-600 hover:text-brand-700"
                      >
                        {event.entityId.slice(0, 8)}…
                      </Link>
                    ) : (
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                        {event.entityId.slice(0, 8)}…
                      </p>
                    )}
                  </TD>
                  <TD className="text-sm text-slate-700">{event.actorName ?? "System"}</TD>
                  <TD>
                    <details>
                      <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-slate-600">
                        JSON
                      </summary>
                      <pre className="mt-1 max-w-sm overflow-x-auto rounded-lg bg-slate-900 p-2 text-[10px] leading-relaxed text-slate-200">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    </details>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">
            Showing {result.items.length} of {result.total}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)}>
                <Button variant="outline" size="sm">
                  Previous
                </Button>
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)}>
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
