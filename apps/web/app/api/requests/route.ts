import { eq } from "drizzle-orm";
import { getDb } from "@procureflow/db";
import { purchaseRequestItems, purchaseRequests } from "@procureflow/db/schema";
import {
  dollarsToCents,
  requestCreateSchema,
  requestListQuerySchema,
} from "@procureflow/shared";
import {
  ApiError,
  assertSameOrigin,
  getRequestIp,
  handleApiError,
  json,
  parseSearchParams,
  readJson,
  requestId,
  requireApiUser,
} from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { getRequestDetail, getVendorForApi, listAllRequests, listMyRequests } from "@/lib/queries";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const query = parseSearchParams(request, requestListQuerySchema);
    if (query.scope === "all" && !["ADMIN", "FINANCE"].includes(user.role)) {
      throw new ApiError(403, "Only finance and admin can list all requests", "forbidden");
    }
    const items =
      query.scope === "all"
        ? await listAllRequests(query.pageSize, query.status)
        : await listMyRequests(user.id, query.pageSize, query.status);
    return json({ items, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/requests" });
  }
}

export async function POST(request: Request) {
  const reqId = requestId(request);
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    enforceRateLimit(`request-create:${user.id}`, 30, 60_000);
    const input = await readJson(request, requestCreateSchema);

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
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(purchaseRequests)
        .values({
          requesterId: user.id,
          department: input.department,
          title: input.title,
          justification: input.justification,
          urgency: input.urgency,
          category: input.category,
          vendorId: input.vendorId,
          currency: input.currency,
          totalAmountCents,
          status: "DRAFT",
          currentStep: 0,
          revision: 1,
        })
        .returning();
      if (!row) throw new Error("Failed to create purchase request");
      await tx.insert(purchaseRequestItems).values(
        items.map((item) => ({
          requestId: row.id,
          ...item,
        })),
      );
      return row;
    });

    await recordAudit({
      entityType: "PURCHASE_REQUEST",
      entityId: created.id,
      action: "REQUEST_CREATED",
      actorId: user.id,
      metadata: {
        title: created.title,
        totalAmountCents,
        vendorId: created.vendorId,
      },
    });

    logger.info("request_created", {
      requestId: created.id,
      actorId: user.id,
      totalAmountCents,
      routeRequestId: reqId,
    });

    const detail = await getRequestDetail(created.id);
    return json({ request: detail }, 201);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/requests", requestId: reqId });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireApiUser();
    throw new ApiError(405, "Update a specific request at /api/requests/:id", "method_not_allowed");
  } catch (error) {
    return handleApiError(error, { route: "PATCH /api/requests" });
  }
}
