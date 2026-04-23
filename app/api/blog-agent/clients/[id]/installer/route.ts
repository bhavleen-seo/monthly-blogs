import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { zipSync, strToU8 } from "fflate";
import { getClient, saveClient } from "@/lib/blog-agent";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await getClient(params.id);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Generate a new secret if the client doesn't have one yet.
    let secret = client.csPublisherSecret;
    if (!secret) {
      secret = randomBytes(32).toString("hex");
      await saveClient({ ...client, csPublisherSecret: secret });
    }

    // Read the committed template and inject the real secret.
    // IMPORTANT: only replace the define() line, NOT every occurrence of the
    // placeholder. The placeholder also appears in the "is the secret still
    // unconfigured?" safety check; that check must keep the original string so
    // it can detect a raw-template install.
    const templatePath = join(process.cwd(), "wp-plugin", "cs-publisher-template.php");
    const template = readFileSync(templatePath, "utf-8");
    const definePattern = `define('CS_PUBLISHER_SECRET', '__CS_PUBLISHER_SECRET__');`;
    if (!template.includes(definePattern)) {
      throw new Error("Plugin template is missing the expected CS_PUBLISHER_SECRET define line");
    }
    const pluginPhp = template.replace(
      definePattern,
      `define('CS_PUBLISHER_SECRET', '${secret}');`
    );

    // Bundle into a zip: cs-publisher/cs-publisher.php
    // (WordPress uses the folder name as the plugin slug.)
    const zipData = zipSync({
      "cs-publisher/cs-publisher.php": strToU8(pluginPhp),
    });

    const clientSlug = client.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return new NextResponse(Buffer.from(zipData), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cs-publisher-${clientSlug}.zip"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate installer" },
      { status: 500 }
    );
  }
}
