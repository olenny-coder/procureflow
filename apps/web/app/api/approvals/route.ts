import { handleApiError, json, requireApiUser } from "@/lib/api";
import { getPendingApprovals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser(["APPROVER", "FINANCE", "ADMIN"]);
    const items = await getPendingApprovals(user, 100);
    return json({ items });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/approvals" });
  }
}
