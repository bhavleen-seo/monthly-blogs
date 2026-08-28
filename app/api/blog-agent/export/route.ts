import { NextResponse } from "next/server";
import { getClients, getTopics, getPosts, getGlobalSettings, getRuns } from "@/lib/blog-agent";
import { getStore } from "@/lib/blog-agent/store";

export async function GET() {
  try {
    const [clients, topics, posts, settings, runs, store] = await Promise.all([
      getClients(),
      getTopics(),
      getPosts(),
      getGlobalSettings(),
      getRuns(1000),
      getStore(),
    ]);
    const schedule = store.schedule;

    // Strip WP app passwords and CS Publisher secrets from the export —
    // these are sensitive and should be re-entered manually after import.
    const safeClients = clients.map(({ wordpressAppPassword, csPublisherSecret, ...rest }) => ({
      ...rest,
      wordpressAppPassword: "",
      csPublisherSecret: undefined,
    }));

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: 1,
      clients: safeClients,
      topics,
      posts,
      settings,
      runs,
      schedule,
    };

    const filename = `monthly-blogs-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
