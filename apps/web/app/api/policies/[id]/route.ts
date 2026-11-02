import { eq } from "drizzle-orm";
import { getDb } from "@procureflow/db";
import { policies } from "@procureflow/db/schema";
import { policyUpsertSchema } from "@procureflow/shared";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getPolicyForApi } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const user = await requireApiUser(["ADMIN"]);
    assertSameOrigin(request);
    const existing = await getPolicyForApi(context.params.id);
    if (!existing) throw new ApiError(404, "Policy not found", "not_found");
    const input = await readJson(request, policyUpsertSchema);

    const db = getDb();
    const [policy] = await db
      .update(policies)
      .set({
        name: input.name,
        description: input.description,
        priority: input.priority,
        enabled: input.enabled,
        conditions: input.conditions,
        approvers: input.approvers,
        updatedAt: new Date(),
      })
      .where(eq(policies.id, context.params.id))
      .returning();

    await recordAudit({
      entityType: "POLICY",
      entityId: context.params.id,
      action: "POLICY_UPDATED",
      actorId: user.id,
      metadata: {
        name: policy?.name,
        previousConditions: existing.conditions,
        conditions: input.conditions,
        approvers: input.approvers,
      },
    });

    return json({ policy });
  } catch (error) {
    return handleApiError(error, { route: "PATCH /api/policies/:id" });
  }
}
