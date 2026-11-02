import { vendorDecisionSchema } from "@procureflow/shared";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getVendorForApi } from "@/lib/queries";
import { signalVendorDecision } from "@/lib/orchestration";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const user = await requireApiUser(["ADMIN", "FINANCE"]);
    assertSameOrigin(request);
    enforceRateLimit(`vendor-decision:${user.id}`, 20, 60_000);
    const input = await readJson(request, vendorDecisionSchema);
    const vendor = await getVendorForApi(context.params.id);
    if (!vendor) throw new ApiError(404, "Vendor not found", "not_found");
    if (["APPROVED", "BLOCKED"].includes(vendor.status)) {
      throw new ApiError(409, `Vendor is already ${vendor.status}`, "already_reviewed");
    }

    await signalVendorDecision({
      vendorId: vendor.id,
      actorId: user.id,
      actorRole: user.role,
      decision: input.decision,
      comment: input.comment,
      riskLevel: input.riskLevel,
    });

    return json({ accepted: true, vendorId: vendor.id, decision: input.decision }, 202);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/vendors/:id/decision" });
  }
}
