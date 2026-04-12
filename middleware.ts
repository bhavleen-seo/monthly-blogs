import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and auth API
  if (pathname === "/login" || pathname === "/api/auth") {
    return NextResponse.next();
  }

  const password = process.env.DASHBOARD_PASSWORD;

  // If no password set, allow access (local dev without auth)
  if (!password) {
    return NextResponse.next();
  }

  const token = req.cookies.get("auth_token")?.value;

  // Simple token check: base64 of the password
  const expectedToken = btoa(password);

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
