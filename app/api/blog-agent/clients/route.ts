import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getClients, saveClient, deleteClient, getClient } from "@/lib/blog-agent";
import type { Client } from "@/lib/blog-agent";

export async function GET() {
  try {
    const clients = await getClients();
    // Strip sensitive credentials from response
    const safeClients = clients.map(({ wordpressAppPassword, ...rest }) => ({
      ...rest,
      hasWordpressPassword: !!wordpressAppPassword,
    }));
    return NextResponse.json({ clients: safeClients });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch clients" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client: Client = {
      id: uuidv4(),
      name: body.name,
      businessName: body.businessName,
      industry: body.industry,
      targetAudience: body.targetAudience || "",
      location: body.location || "",
      websiteUrl: body.websiteUrl || "",
      wordpressUrl: body.wordpressUrl,
      wordpressUsername: body.wordpressUsername,
      wordpressAppPassword: body.wordpressAppPassword,
      tone: body.tone || "professional",
      keywords: body.keywords || [],
      seoNotes: body.seoNotes || "",
      blogCategories: body.blogCategories || [],
      postsPerMonth: body.postsPerMonth || 2,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveClient(client);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create client" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "Client ID required" }, { status: 400 });
    }
    const existing = await getClient(body.id);
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    // Preserve existing WP password if not provided in update
    if (!body.wordpressAppPassword) {
      body.wordpressAppPassword = existing.wordpressAppPassword;
    }
    const updated: Client = { ...existing, ...body, updatedAt: new Date().toISOString() };
    await saveClient(updated);
    return NextResponse.json({ client: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update client" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Client ID required" }, { status: 400 });
    }
    await deleteClient(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete client" },
      { status: 500 }
    );
  }
}
