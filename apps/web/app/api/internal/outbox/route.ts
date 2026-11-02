import { notificationProcessSchema } from "@procureflow/shared";
import {
  ApiError,
  assertSameOrigin,
  getRequestIp,
  handleApiError,
  json,
  readJson,
  requestId,
} from "@/lib/api";
import { requireApiUser } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { startNotificationOutboxWorkflow } from "@/lib/temporal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function authorize(request: Request): Promise<"token" | "admin"> {
  const token = process.env.INTERNAL_API_TOKEN;
  const header = request.headers.get("authorization");
  if (token && header === `Bearer ${token}`) return "token";

  try {
    await requireApiUser(["ADMIN"]);
    return "admin";
  } catch {
    throw new ApiError(401, "Provide a valid internal token or sign in as admin", "unauthorized");
  }
}

export async function POST(request: Request) {
  const reqId = requestId(request);
  try {
    assertSameOrigin(request);
    const actor = await authorize(request);
    enforceRateLimit(`outbox:${getRequestIp(request)}`, 10, 60_000);
    const input = await readJson(request, notificationProcessSchema);
    const result = await startNotificationOutboxWorkflow(input.limit ?? 50);

    logger.info("outbox_drain_started", {
      workflowId: result.workflowId,
      limit: input.limit ?? 50,
      actor,
      requestId: reqId,
    });
    return json({ ...result, accepted: true }, 202);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/internal/outbox", requestId: reqId });
  }
}
