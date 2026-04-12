import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function hashToken(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const correctPassword = process.env.DASHBOARD_PASSWORD;

    if (!correctPassword) {
      return NextResponse.json(
        { error: "DASHBOARD_PASSWORD not set in environment" },
        { status: 500 }
      );
    }

    if (password !== correctPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = hashToken(correctPassword + process.env.DASHBOARD_PASSWORD);
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
