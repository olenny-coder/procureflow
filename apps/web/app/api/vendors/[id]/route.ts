import { eq } from "drizzle-orm";
import { getDb } from "@procureflow/db";
import { vendors } from "@procureflow/db/schema";
import { vendorUpdateSchema } from "@procureflow/shared";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getVendorForApi } from "@/lib/queries";
import { queryVendorState } from "@/lib/orchestration";
import { WORKFLOW_IDS } from "@procureflow/shared";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    await requireApiUser();
    const vendor = await getVendorForApi(context.params.id);
    if (!vendor) throw new ApiError(404, "Vendor not found", "not_found");
    const workflowState = await queryVendorState(WORKFLOW_IDS.vendorOnboarding(vendor.id));
    return json({ vendor, workflowState });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/vendors/:id" });
  }
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const vendor = await getVendorForApi(context.params.id);
    if (!vendor) throw new ApiError(404, "Vendor not found", "not_found");

    const privileged = user.role === "ADMIN" || user.role === "FINANCE";
    if (vendor.createdBy !== user.id && !privileged) {
      throw new ApiError(403, "You can only edit vendors you created", "forbidden");
    }
    if (!privileged && !["DRAFT", "PENDING_REVIEW"].includes(vendor.status)) {
      throw new ApiError(409, "Only finance or admin can edit a reviewed vendor", "not_editable");
    }

    const input = await readJson(request, vendorUpdateSchema);
    const db = getDb();
    const [updated] = await db
      .update(vendors)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
        ...(input.bankAccountMasked !== undefined
          ? { bankAccountMasked: input.bankAccountMasked }
          : {}),
        ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel } : {}),
        updatedAt: new Date(),
      })
      .where(eq(vendors.id, context.params.id))
      .returning();

    await recordAudit({
      entityType: "VENDOR",
      entityId: context.params.id,
      action: "VENDOR_UPDATED",
      actorId: user.id,
      metadata: { fields: Object.keys(input) },
    });

    return json({ vendor: updated });
  } catch (error) {
    return handleApiError(error, { route: "PATCH /api/vendors/:id" });
  }
}
