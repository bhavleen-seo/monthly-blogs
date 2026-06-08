import { NextRequest, NextResponse } from "next/server";
import { getPost, getClient } from "@/lib/blog-agent";
import { savePost } from "@/lib/blog-agent/store";
import { resolveCanonicalApiBase, getAuthHeader, uploadFeaturedImageBuffer } from "@/lib/blog-agent/publisher";

export const dynamic = "force-dynamic";

/**
 * POST /api/blog-agent/posts/upload-image
 * Body: multipart/form-data with fields:
 *   - postId (string)
 *   - image  (File)  — already resized to ≤1920px by the browser
 *
 * Path 1 (preferred): upload directly to WP media library via REST API.
 * Path 2 (fallback):  if WP REST returns 401/403 (e.g. Wordfence blocks app
 *   passwords), store the image in KV temporarily and tell CS Publisher to
 *   sideload it via its update_image_only endpoint.
 *
 * Returns { success, featuredImageUrl, post }.
 */
export async function POST(req: NextRequest) {
  try {
    const form   = await req.formData();
    const postId = (form.get("postId") as string | null)?.trim() || "";
    const file   = form.get("image") as File | null;

    if (!postId || !file) {
      return NextResponse.json({ error: "postId and image are required" }, { status: 400 });
    }

    const post = await getPost(postId);
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const client = await getClient(post.clientId);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const buffer      = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";
    const filename    = file.name || `${post.slug || post.id}.jpg`;

    // ── Path 1: Native WP REST (preferred) ──────────────────────────────────
    if (client.wordpressAppPassword && client.wordpressUsername) {
      try {
        const apiBase = await resolveCanonicalApiBase(client);
        const mediaId = await uploadFeaturedImageBuffer(
          client, apiBase, buffer, contentType, filename, post.featuredImageAlt || post.title
        );

        // Get the WP-hosted URL for the uploaded image
        const authHeader = await getAuthHeader(client);
        const mediaRes   = await fetch(`${apiBase}/media/${mediaId}`, { headers: { Authorization: authHeader } });
        let wpImageUrl   = "";
        if (mediaRes.ok) {
          const mediaData: { source_url?: string } = await mediaRes.json();
          wpImageUrl = mediaData.source_url || "";
        }

        const updatedPost = { ...post, featuredImageUrl: wpImageUrl || `${apiBase}/media/${mediaId}`, freepikId: String(mediaId) };
        await savePost(updatedPost);
        return NextResponse.json({ success: true, featuredImageUrl: wpImageUrl, post: updatedPost });

      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const isPermissionError = msg.includes("(401)") || msg.includes("(403)");
        // If it's not a permission error, surface it directly
        if (!isPermissionError || !client.csPublisherSecret) {
          return NextResponse.json({ error: msg || "WP media upload failed" }, { status: 502 });
        }
        // Permission error + CS Publisher available → fall through to Path 2
        console.warn("[upload-image] WP REST blocked (401/403) — falling back to CS Publisher");
      }
    }

    // ── Path 2: CS Publisher fallback (for Wordfence-hardened sites) ─────────
    if (!client.csPublisherSecret) {
      return NextResponse.json(
        { error: "No WordPress credentials configured — add an app password or install CS Publisher in the Clients tab" },
        { status: 400 }
      );
    }

    // Store the image in KV temporarily so CS Publisher can download it via URL
    const origin  = req.nextUrl.origin;
    const storeFd = new FormData();
    storeFd.append("image", new Blob([buffer], { type: contentType }), filename);
    const storeRes  = await fetch(`${origin}/api/blog-agent/posts/temp-image`, { method: "POST", body: storeFd });
    if (!storeRes.ok) {
      return NextResponse.json({ error: "Failed to create temporary image URL for CS Publisher" }, { status: 502 });
    }
    const { tempUrl } = await storeRes.json() as { tempUrl: string };

    // Ask CS Publisher to sideload the image onto the existing WP post
    const configured = client.wordpressUrl.replace(/\/+$/, "");
    const encodedSecret = encodeURIComponent(client.csPublisherSecret);
    const attempts = [
      { url: `${configured}/wp-json/cs-publisher/v1/publish`, useHeader: true },
      { url: `${configured}/wp-json/cs-publisher/v1/publish?cs_secret=${encodedSecret}`, useHeader: false },
      { url: `${configured}/?rest_route=/cs-publisher/v1/publish`, useHeader: true },
      { url: `${configured}/?rest_route=/cs-publisher/v1/publish&cs_secret=${encodedSecret}`, useHeader: false },
    ];
    const body = {
      post_id: post.wordpressPostId || 0,
      update_image_only: true,
      featured_image: { url: tempUrl, filename, alt: post.featuredImageAlt || post.title },
    };
    let csRes: Response | null = null;
    for (const { url, useHeader } of attempts) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (useHeader) headers["X-CS-Secret"] = client.csPublisherSecret;
      csRes = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), redirect: "manual" });
      if (csRes.status !== 404) break;
    }

    if (!csRes || !csRes.ok) {
      const errText = csRes ? await csRes.text().catch(() => "") : "No response";
      return NextResponse.json({ error: `CS Publisher upload failed: ${csRes?.status} — ${errText.slice(0, 200)}` }, { status: 502 });
    }

    // Save the temp URL as the featuredImageUrl (CS Publisher now hosts it on WP)
    const updatedPost = { ...post, featuredImageUrl: tempUrl, freepikId: "0" };
    await savePost(updatedPost);
    return NextResponse.json({ success: true, featuredImageUrl: tempUrl, post: updatedPost });

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
