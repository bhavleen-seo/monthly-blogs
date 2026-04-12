import { NextResponse } from "next/server";
import { getStore, saveStore } from "@/lib/blog-agent";
import { createSeededClients } from "@/lib/blog-agent/seed-clients";

export async function POST() {
  try {
    const store = await getStore();

    if (store.clients.length > 0) {
      return NextResponse.json(
        { error: "Clients already exist. Delete existing clients first to re-seed." },
        { status: 400 }
      );
    }

    const clients = createSeededClients();
    store.clients = clients;
    await saveStore(store);

    return NextResponse.json({
      message: `Seeded ${clients.length} clients successfully`,
      clients: clients.map((c) => ({ id: c.id, name: c.businessName })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to seed clients" },
      { status: 500 }
    );
  }
}
