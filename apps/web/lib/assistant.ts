import { ApiError } from "@/lib/api";

const SERVICE_URL = process.env.ASSISTANT_SERVICE_URL ?? "http://127.0.0.1:8001";
const INTERNAL_TOKEN = process.env.ASSISTANT_INTERNAL_TOKEN ?? "dev-assistant-token";

type AssistantUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  department?: string | null;
};

export async function assistantRequest<T>(
  path: string,
  init: RequestInit,
  user: AssistantUser,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SERVICE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Assistant-Token": INTERNAL_TOKEN,
        "X-User-Id": user.id,
        "X-User-Role": user.role,
        "X-User-Email": user.email ?? "",
        "X-User-Name": user.name ?? "",
        "X-User-Department": user.department ?? "General",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(75_000),
    });
  } catch {
    throw new ApiError(
      503,
      "The procurement assistant is not available. Start the assistant service and try again.",
      "assistant_unavailable",
    );
  }

  if (!response.ok) {
    let message = "The assistant could not process this turn.";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Keep the generic message when the service returns non-JSON.
    }
    throw new ApiError(response.status, message, "assistant_error");
  }

  return (await response.json()) as T;
}
