import { getDb } from "@procureflow/db";
import { vendors } from "@procureflow/db/schema";
import { vendorCreateSchema } from "@procureflow/shared";
import {
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { listVendors } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiUser();
    return json({ items: await listVendors() });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/vendors" });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    enforceRateLimit(`vendor-create:${user.id}`, 20, 60_000);
    const input = await readJson(request, vendorCreateSchema);

    const db = getDb();
    const [vendor] = await db
      .insert(vendors)
      .values({
        name: input.name,
        website: input.website ?? null,
        contactEmail: input.contactEmail,
        status: "DRAFT",
        riskLevel: input.riskLevel,
        taxId: input.taxId ?? null,
        bankAccountMasked: input.bankAccountMasked ?? null,
        createdBy: user.id,
      })
      .returning();
    if (!vendor) throw new Error("Failed to create vendor");

    await recordAudit({
      entityType: "VENDOR",
      entityId: vendor.id,
      action: "VENDOR_CREATED",
      actorId: user.id,
      metadata: { name: vendor.name, riskLevel: vendor.riskLevel, status: vendor.status },
    });

    return json({ vendor }, 201);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/vendors" });
  }
}
