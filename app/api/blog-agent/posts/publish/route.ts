import { NextRequest, NextResponse } from "next/server";
import { runPublishing } from "@/lib/blog-agent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientId = body.clientId || undefined;
    const postId = body.postId || undefined;

    const { run, results } = await runPublishing(clientId, postId);

    return NextResponse.json({
      run,
      results,
      summary: {
        total: results.length,
        success: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish posts" },
      { status: 500 }
    );
  }
}
