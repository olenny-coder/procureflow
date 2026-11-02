import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ZodError, type ZodSchema } from "zod";
import type { Role } from "@procureflow/shared";
import { authOptions } from "./auth";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "api_error",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function handleApiError(error: unknown, context?: { route?: string; requestId?: string }): NextResponse {
  if (error instanceof ApiError) {
    return json(
      { error: { code: error.code, message: error.message, details: error.details ?? undefined } },
      error.status,
    );
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: {
          code: "validation_error",
          message: "Some fields are invalid",
          details: error.flatten(),
        },
      },
      422,
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      service: "procureflow-web",
      msg: "api_unhandled_error",
      route: context?.route,
      requestId: context?.requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  return json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
}

export async function requireApiUser(roles?: Role[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new ApiError(401, "Sign in to continue", "unauthorized");
  }
  if (roles && roles.length > 0 && !roles.includes(session.user.role)) {
    throw new ApiError(403, "You do not have permission to perform this action", "forbidden");
  }
  return session.user;
}

export async function readJson<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON", "invalid_json");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(422, "Some fields are invalid", "validation_error", parsed.error.flatten());
  }
  return parsed.data;
}

export function requestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Lightweight CSRF guard for cookie-authenticated mutations. Browsers send an
 * Origin header; reject cross-site origins. Non-browser clients (smoke tests)
 * without Origin are allowed and still require a valid session cookie.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "Invalid request origin", "invalid_origin");
  }
  if (host && originHost !== host) {
    throw new ApiError(403, "Cross-origin request blocked", "invalid_origin");
  }
}

export function requireToken(request: Request, expected: string | undefined): void {
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    throw new ApiError(401, "Invalid internal token", "unauthorized");
  }
}

export function parseSearchParams<T>(request: Request, schema: ZodSchema<T>): T {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, "Invalid query parameters", "validation_error", parsed.error.flatten());
  }
  return parsed.data;
}
