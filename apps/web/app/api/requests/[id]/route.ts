import { eq } from "drizzle-orm";
import { getDb } from "@procureflow/db";
import { purchaseRequestItems, purchaseRequests } from "@procureflow/db/schema";
import { dollarsToCents, requestUpdateSchema } from "@procureflow/shared";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getRequestDetail, getVendorForApi } from "@/lib/queries";
import { queryPurchaseRequestState } from "@/lib/orchestration";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const detail = await getRequestDetail(context.params.id);
    if (!detail) throw new ApiError(404, "Purchase request not found", "not_found");
    if (user.role === "REQUESTER" && detail.requesterId !== user.id) {
      throw new ApiError(403, "You can only view your own requests", "forbidden");
    }
    const workflowState =
      detail.workflowId && detail.status !== "DRAFT"
        ? await queryPurchaseRequestState(detail.workflowId)
        : null;
    return json({ request: detail, workflowState });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/requests/:id" });
  }
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const detail = await getRequestDetail(context.params.id);
    if (!detail) throw new ApiError(404, "Purchase request not found", "not_found");
    if (detail.requesterId !== user.id && user.role !== "ADMIN") {
      throw new ApiError(403, "Only the requester can edit this request", "forbidden");
    }
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(detail.status)) {
      throw new ApiError(
        409,
        `A request in ${detail.status} cannot be edited`,
        "not_editable",
      );
    }

    const input = await readJson(request, requestUpdateSchema);
    const vendor = await getVendorForApi(input.vendorId);
    if (!vendor) throw new ApiError(422, "Select a valid vendor", "invalid_vendor");
    if (vendor.status === "BLOCKED") {
      throw new ApiError(422, "This vendor is blocked and cannot be used", "vendor_blocked");
    }

    const items = input.items.map((item) => {
      const unitPriceCents = dollarsToCents(item.unitPrice);
      return {
        description: item.description,
        quantity: item.quantity,
        unitPriceCents,
        totalPriceCents: unitPriceCents * item.quantity,
      };
    });
    const totalAmountCents = items.reduce((sum, item) => sum + item.totalPriceCents, 0);
    if (totalAmountCents <= 0) {
      throw new ApiError(422, "Request total must be positive", "invalid_total");
    }

    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .update(purchaseRequests)
        .set({
          department: input.department,
          title: input.title,
          justification: input.justification,
          urgency: input.urgency,
          category: input.category,
          vendorId: input.vendorId,
          currency: input.currency,
          totalAmountCents,
          updatedAt: new Date(),
        })
        .where(eq(purchaseRequests.id, context.params.id));
      await tx
        .delete(purchaseRequestItems)
        .where(eq(purchaseRequestItems.requestId, context.params.id));
      await tx.insert(purchaseRequestItems).values(
        items.map((item) => ({
          requestId: context.params.id,
          ...item,
        })),
      );
    });

    await recordAudit({
      entityType: "PURCHASE_REQUEST",
      entityId: context.params.id,
      action: "REQUEST_UPDATED",
      actorId: user.id,
      metadata: {
        totalAmountCents,
        title: input.title,
        itemCount: items.length,
      },
    });

    return json({ request: await getRequestDetail(context.params.id) });
  } catch (error) {
    return handleApiError(error, { route: "PATCH /api/requests/:id" });
  }
}
