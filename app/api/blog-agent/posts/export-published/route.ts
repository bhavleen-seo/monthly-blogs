import { NextResponse } from "next/server";
import { getPosts, getClients } from "@/lib/blog-agent";

export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  try {
    const [posts, clients] = await Promise.all([getPosts(), getClients()]);
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    const rows = posts
      .filter((p) => p.status === "published" && p.publishedUrl)
      .map((p) => ({
        clientName: clientMap.get(p.clientId)?.businessName || "Unknown",
        url: p.publishedUrl!,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.url.localeCompare(b.url));

    const header = ["Client Name", "Blog URL"].join(",");
    const body = rows.map((r) => `${csvEscape(r.clientName)},${csvEscape(r.url)}`).join("\n");
    const csv = "﻿" + header + "\n" + body + (body ? "\n" : "");

    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="published-blogs-${today}.csv"`,
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
