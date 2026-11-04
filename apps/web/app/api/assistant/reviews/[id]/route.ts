import { z } from "zod";
import { assertSameOrigin, handleApiError, json, readJson, requireApiUser } from "@/lib/api";
import { assistantRequest } from "@/lib/assistant";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "EDIT"]),
  value: z.unknown().optional(),
  note: z.string().max(2000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireApiUser(["APPROVER", "FINANCE", "ADMIN"]);
    assertSameOrigin(request);
    const input = await readJson(request, decisionSchema);
    const data = await assistantRequest(
      `/v1/reviews/${encodeURIComponent(params.id)}/decision`,
      { method: "POST", body: JSON.stringify(input) },
      user,
    );
    return json(data);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/assistant/reviews/:id" });
  }
}
