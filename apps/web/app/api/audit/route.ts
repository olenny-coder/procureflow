import { auditQuerySchema } from "@procureflow/shared";
import { handleApiError, json, parseSearchParams, requireApiUser } from "@/lib/api";
import { getAuditPage } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiUser(["ADMIN", "FINANCE"]);
    const query = parseSearchParams(request, auditQuerySchema);
    const result = await getAuditPage({
      entityType: query.entityType || undefined,
      entityId: query.entityId || undefined,
      action: query.action || undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    });
    return json({ ...result, page: query.page ?? 1, pageSize: query.pageSize ?? 25 });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/audit" });
  }
}
