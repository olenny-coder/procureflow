import { ApiError, assertSameOrigin, handleApiError, json, requireApiUser } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getVendorForApi } from "@/lib/queries";
import { startVendorOnboarding } from "@/lib/temporal";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const user = await requireApiUser(["ADMIN", "FINANCE"]);
    assertSameOrigin(request);
    enforceRateLimit(`vendor-review:${user.id}`, 20, 60_000);
    const vendor = await getVendorForApi(context.params.id);
    if (!vendor) throw new ApiError(404, "Vendor not found", "not_found");
    if (["APPROVED", "BLOCKED"].includes(vendor.status)) {
      throw new ApiError(409, `Vendor is already ${vendor.status}`, "already_reviewed");
    }

    const result = await startVendorOnboarding({
      vendorId: vendor.id,
      actorId: user.id,
    });
    return json({ ...result }, result.alreadyRunning ? 200 : 202);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/vendors/:id/review" });
  }
}
