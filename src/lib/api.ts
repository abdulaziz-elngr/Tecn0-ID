import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "./rbac";

/**
 * Shared HTTP plumbing for every API route.
 *
 * Goals (spec §48 Error handling, §42 Security):
 *  - Clients NEVER see stack traces, SQL text, file paths or driver
 *    messages. They see a human sentence plus a correlation `errorId`.
 *  - The full technical detail is logged server-side against that same
 *    errorId so support can find it.
 */

export class BusinessRuleError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, options?: { status?: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "BusinessRuleError";
    this.status = options?.status ?? 422;
    this.code = options?.code ?? "BUSINESS_RULE_VIOLATION";
    this.details = options?.details;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function paginated<T>(
  data: T[],
  pagination: { page: number; pageSize: number; total: number }
) {
  return NextResponse.json({
    data,
    pagination: {
      ...pagination,
      totalPages: Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    }
  });
}

/** Maps any thrown value to a safe HTTP response. */
export function handleApiError(scope: string, err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof BusinessRuleError) {
    return NextResponse.json(
      { error: err.message, code: err.code, details: err.details },
      { status: err.status }
    );
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Invalid request data.", details: err.flatten() },
      { status: 400 }
    );
  }

  // Unknown/unexpected — log with a correlation id, return nothing useful
  // to an attacker.
  const errorId = randomUUID();
  console.error(`[${scope}] errorId=${errorId}`, err);
  return NextResponse.json(
    {
      error: "Something went wrong. Please try again.",
      errorId
    },
    { status: 500 }
  );
}

/** Parses and validates a JSON body, throwing ZodError on failure. */
export async function readJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new BusinessRuleError("Invalid JSON body.", { status: 400, code: "INVALID_BODY" });
  }
  return schema.parse(raw);
}

/** Parses and validates query params, throwing ZodError on failure. */
export function readQuery<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const url = new URL(request.url);
  const entries: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    entries[key] = value;
  });
  return schema.parse(entries);
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

/** Best-effort client IP for audit logs and rate limiting. */
export function clientIp(request: Request): string | undefined {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return headers.get("x-real-ip") ?? undefined;
}

export function userAgent(request: Request): string | undefined {
  return request.headers.get("user-agent") ?? undefined;
}
