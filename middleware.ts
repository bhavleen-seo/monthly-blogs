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
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
