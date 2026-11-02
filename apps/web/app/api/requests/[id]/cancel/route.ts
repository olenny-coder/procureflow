import { eq } from "drizzle-orm";
import { getDb } from "@procureflow/db";
import { purchaseRequests } from "@procureflow/db/schema";
import { ApiError, assertSameOrigin, handleApiError, json, requireApiUser } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getRequestDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const detail = await getRequestDetail(context.params.id);
    if (!detail) throw new ApiError(404, "Purchase request not found", "not_found");
    if (detail.requesterId !== user.id && user.role !== "ADMIN") {
      throw new ApiError(403, "Only the requester can cancel this request", "forbidden");
    }
    if (detail.status !== "DRAFT") {
      throw new ApiError(
        409,
        "Only draft requests can be cancelled. In-flight approvals must be completed or rejected.",
        "not_cancellable",
      );
    }

    const db = getDb();
    await db
      .update(purchaseRequests)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(eq(purchaseRequests.id, context.params.id));

    await recordAudit({
      entityType: "PURCHASE_REQUEST",
      entityId: context.params.id,
      action: "REQUEST_CANCELLED",
      actorId: user.id,
      metadata: { previousStatus: detail.status },
    });

    return json({ request: await getRequestDetail(context.params.id) });
  } catch (error) {
    return handleApiError(error, { route: "POST /api/requests/:id/cancel" });
  }
}
