import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestIp, json } from "@/lib/api";
import { ApiError } from "@/lib/api";

const handler = NextAuth(authOptions);

export { handler as GET };

export async function POST(
  request: NextRequest,
  context: { params: { nextauth: string[] } },
) {
  const action = (context.params.nextauth ?? []).join("/");
  if (action.includes("callback/credentials")) {
    try {
      enforceRateLimit(`login:${getRequestIp(request)}`, 10, 60_000);
    } catch (error) {
      if (error instanceof ApiError) {
        return json(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      }
      throw error;
    }
  }
  return handler(request, context);
}
