import { NextRequest, NextResponse } from "next/server";
import { getPosts, getClients } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // ?month=YYYY-MM filters to that month's published posts only.
    // Defaults to current month so the button always exports this cycle.
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = searchParams.get("month") || currentMonth;

    const [posts, clients] = await Promise.all([getPosts(), getClients()]);
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    const rows = posts
      .filter((p) => p.status === "published" && p.publishedUrl && p.publishedAt?.startsWith(month))
      .map((p) => ({
        clientName: clientMap.get(p.clientId)?.businessName || "Unknown",
        url: p.publishedUrl!,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.url.localeCompare(b.url));

    const header = ["Client Name", "Blog URL"].join(",");
    const body = rows.map((r) => `${csvEscape(r.clientName)},${csvEscape(r.url)}`).join("\n");
    const csv = "﻿" + header + "\n" + body + (body ? "\n" : "");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="published-blogs-${month}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export published posts" },
      { status: 500 }
    );
  }
}
