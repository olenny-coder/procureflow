import { getDb } from "@procureflow/db";
import { policies } from "@procureflow/db/schema";
import { policyUpsertSchema } from "@procureflow/shared";
import {
  assertSameOrigin,
  handleApiError,
  json,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { listPolicies } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiUser(["ADMIN"]);
    return json({ items: await listPolicies() });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/policies" });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["ADMIN"]);
    assertSameOrigin(request);
    const input = await readJson(request, policyUpsertSchema);

    const db = getDb();
    const [policy] = await db
      .insert(policies)
      .values({
        name: input.name,
        description: input.description,
        priority: input.priority,
        enabled: input.enabled,
        conditions: input.conditions,
        approvers: input.approvers,
      })
      .returning();
    if (!policy) throw new Error("Failed to create policy");

    await recordAudit({
      entityType: "POLICY",
      entityId: policy.id,
      action: "POLICY_CREATED",
      actorId: user.id,
      metadata: { name: policy.name, priority: policy.priority, approvers: policy.approvers },
    });

    return json({ policy }, 201);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/policies" });
  }
}
