import { assertSameOrigin, handleApiError, json, requireApiUser } from "@/lib/api";
import { assistantRequest } from "@/lib/assistant";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["REQUESTER", "ADMIN"]);
    assertSameOrigin(request);
    enforceRateLimit(`assistant-start:${user.id}`, 10, 60_000);
    const data = await assistantRequest("/v1/conversations", { method: "POST" }, user);
    return json(data, 201);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/assistant/conversations" });
  }
}
