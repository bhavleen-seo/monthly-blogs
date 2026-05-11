import { NextRequest, NextResponse } from "next/server";

async function hashToken(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and auth API
  if (pathname === "/login" || pathname === "/api/auth") {
    return NextResponse.next();
  }

  // Vercel cron endpoint: called by Vercel's cron system with its own
  // Authorization: Bearer $CRON_SECRET header. The route validates that
  // itself, and Vercel cron has no dashboard cookie to satisfy this gate.
  if (pathname.startsWith("/api/blog-agent/cron/")) {
    return NextResponse.next();
  }

  // Accept token hashed from either env var OR fallback (both are valid
  // login options, so both produce valid session cookies)
  const password = process.env.DASHBOARD_PASSWORD || "csdesign26";
  const token = req.cookies.get("auth_token")?.value;
  const expectedToken = await hashToken(password);

  if (token === expectedToken) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Skip static assets and the Vercel cron endpoint (which authenticates
    // itself via CRON_SECRET). Cron calls have no dashboard cookie and would
    // otherwise be redirected to /login, silently breaking automation.
    "/((?!_next/static|_next/image|favicon.ico|api/blog-agent/cron/).*)",
  ],
};
