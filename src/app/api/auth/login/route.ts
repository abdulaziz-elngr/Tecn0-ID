import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { login } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255)
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password format." }, { status: 400 });
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? undefined;

  try {
    const result = await login({
      email: parsed.data.email,
      password: parsed.data.password,
      ipAddress,
      userAgent
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // Never leak internal error details to the client.
    console.error("[auth/login] internal error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
