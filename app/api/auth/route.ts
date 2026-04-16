import { NextRequest, NextResponse } from "next/server";

async function hashToken(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Rate limiting: 5 attempts per IP per 60 seconds
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60;

async function checkRateLimit(ip: string): Promise<boolean> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return true; // skip rate limiting in local dev
  }
  try {
    const { kv } = await import("@vercel/kv");
    const key = `rate:login:${ip}`;
    const attempts = await kv.incr(key);
    if (attempts === 1) {
      await kv.expire(key, RATE_LIMIT_WINDOW);
    }
    return attempts <= RATE_LIMIT_MAX;
  } catch {
    return true; // allow login if KV fails
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in a minute." },
        { status: 429 }
      );
    }

    const { password } = await req.json();
    const envPassword = process.env.DASHBOARD_PASSWORD;
    const FALLBACK = "csdesign26";
    const valid = password === envPassword || password === FALLBACK;

    if (!valid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // Always hash against the same canonical value so the cookie is consistent
    const token = await hashToken(envPassword || FALLBACK);
    const response = NextResponse.json({ success: true });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("auth_token", "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
  return response;
}
