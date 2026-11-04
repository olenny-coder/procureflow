import { z } from "zod";
import { assertSameOrigin, handleApiError, json, readJson, requireApiUser } from "@/lib/api";
import { assistantRequest } from "@/lib/assistant";

export const dynamic = "force-dynamic";

const turnSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);
    const input = await readJson(request, turnSchema);
    const data = await assistantRequest(
      `/v1/conversations/${encodeURIComponent(params.id)}/turns`,
      { method: "POST", body: JSON.stringify(input) },
      user,
    );
    return json(data);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/assistant/conversations/:id/turns" });
  }
}
