import { handleApiError, json, requireApiUser } from "@/lib/api";
import { assistantRequest } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser(["APPROVER", "FINANCE", "ADMIN"]);
    const data = await assistantRequest("/v1/reviews", { method: "GET" }, user);
    return json(data);
  } catch (error) {
    return handleApiError(error, { route: "GET /api/assistant/reviews" });
  }
}
