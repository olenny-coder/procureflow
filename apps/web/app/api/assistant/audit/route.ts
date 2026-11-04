import { handleApiError, json, requireApiUser } from "@/lib/api";
import { assistantRequest } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(["ADMIN", "FINANCE"]);
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
    const data = await assistantRequest(`/v1/audit${query}`, { method: "GET" }, user);
    return json(data);
  } catch (error) {
    return handleApiError(error, { route: "GET /api/assistant/audit" });
  }
}
