import type { Client, BlogPost } from "./types";

interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
}

interface WordPressPostResponse {
  id: number;
  link: string;
  status: string;
}

/**
 * Build a Basic Auth header from the WordPress username + application password
 * stored on the client record. Previously this preferred an encrypted Bitwarden-
 * synced copy; that integration was removed — credentials now come straight
 * from the client form in the dashboard.
 */
async function getAuthHeader(client: Client): Promise<string> {
  const username = client.wordpressUsername;
  const password = client.wordpressAppPassword || "";
  const credentials = `${username}:${password}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function getApiBase(client: Client): string {
  const base = client.wordpressUrl.replace(/\/+$/, "");
  return `${base}/wp-json/wp/v2`;
}

/**
 * Resolve the canonical /wp-json/wp/v2 base for the client.
 *
 * If `client.wordpressUrl` points to a host that redirects (e.g. `foo.com` →
 * `www.foo.com`), a POST would be silently converted to GET by Node's fetch
 * (per HTTP spec) and the Authorization header stripped on cross-origin hops.
 * WP would then return an array of existing posts as a 200 OK, our code would
 * read `id`/`link` as `undefined`, and mark the post "published" without
 * anything actually reaching WP.
 *
 * We avoid that by probing `/wp-json/wp/v2` with a redirect-following GET,
 * then deriving the base URL from the final response's origin. All subsequent
 * POSTs go to the canonical origin — no redirect, auth preserved.
 */
async function resolveCanonicalApiBase(client: Client): Promise<string> {
  const configured = getApiBase(client);
  try {
    const res = await fetch(configured, { method: "GET", redirect: "follow" });
    const finalOrigin = new URL(res.url).origin;
    return `${finalOrigin}/wp-json/wp/v2`;
  } catch {
    return configured;
  }
}

/**
 * Fetch titles of already-published blog posts from the client's WordPress site.
 * Used by the researcher to avoid suggesting topics that already exist.
 * Returns up to ~500 most recent posts. Failures return an empty array so research
 * can still proceed (the downside is we might suggest a duplicate).
 */
/**
 * Delete a post from WordPress via the standard REST API (DELETE /wp/v2/posts/{id}).
 * Returns { success, message } — never throws, so the caller can choose to
 * continue with local deletion regardless.
 *
 * Uses the stored WP Application Password (same creds as native publish path).
 * If the site has Wordfence or similar blocking these writes, the call will
 * fail — in that case the UI should surface a link to the WP admin for manual
 * trash/delete.
 */
export async function deleteFromWordPress(
  client: Client,
  wordpressPostId: number
): Promise<{ success: boolean; message: string }> {
  try {
    const configured = client.wordpressUrl.replace(/\/+$/, "");
    let origin = configured;
    try {
      const canonical = await resolveCanonicalApiBase(client);
      origin = new URL(canonical).origin;
    } catch { /* fall back to configured */ }

    const authHeader = await getAuthHeader(client);
    // force=true → skip trash, delete permanently
    const urls = [
      `${origin}/wp-json/wp/v2/posts/${wordpressPostId}?force=true`,
      `${configured}/wp-json/wp/v2/posts/${wordpressPostId}?force=true`,
      `${origin}/?rest_route=/wp/v2/posts/${wordpressPostId}&force=true`,
    ];
    const unique = Array.from(new Set(urls));

    let lastStatus = 0;
    let lastBody = "";
    for (const url of unique) {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: authHeader },
        redirect: "manual",
      });
      if (res.ok) {
        return { success: true, message: `Deleted post ${wordpressPostId} from WordPress` };
      }
      if (res.status === 404) continue; // try next URL variant
      lastStatus = res.status;
      lastBody = (await res.text().catch(() => "")).slice(0, 200);
      break;
    }

    return {
      success: false,
      message: lastStatus
        ? `WordPress refused delete (${lastStatus}): ${lastBody}. Your WP credentials may not have delete permission, or Wordfence is blocking the request.`
        : `Could not reach WordPress delete endpoint.`,
    };
  } catch (err) {
    return {
      success: false,
      message: `WordPress delete error: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

export async function getPublishedPostTitles(client: Client): Promise<string[]> {
  try {
    const apiBase = getApiBase(client);
    const authHeader = await getAuthHeader(client);
    const titles: string[] = [];
    const perPage = 100;
    const maxPages = 5; // up to ~500 titles — plenty of context

    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(
        `${apiBase}/posts?per_page=${perPage}&page=${page}&_fields=title,status&status=publish,draft,pending,future,private`,
        { headers: { Authorization: authHeader } }
      );
      if (!res.ok) break;
      const posts: Array<{ title?: { rendered?: string } }> = await res.json();
      if (!Array.isArray(posts) || posts.length === 0) break;

      for (const p of posts) {
        const raw = p?.title?.rendered;
        if (typeof raw === "string") {
          // Strip HTML entities and tags
          const clean = raw.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();
          if (clean) titles.push(clean);
        }
      }

      if (posts.length < perPage) break;
    }

    return titles;
  } catch (err) {
    console.error("[getPublishedPostTitles] failed:", err);
    return [];
  }
}

// Exported so the upload-image API route can reuse it without re-downloading
export async function uploadFeaturedImageBuffer(
  client: Client,
  apiBase: string,
  buffer: Buffer,
  contentType: string,
  filename: string,
  altText?: string
): Promise<number | null> {
  const authHeader = await getAuthHeader(client);
  const uploadRes = await fetch(`${apiBase}/media`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: buffer as unknown as BodyInit,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`WP media upload failed (${uploadRes.status}): ${errText.slice(0, 300)}`);
  }
  const media: { id: number } = await uploadRes.json();
  if (altText && media.id) {
    try {
      await fetch(`${apiBase}/media/${media.id}`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: altText }),
      });
    } catch { /* non-fatal */ }
  }
  return media.id;
}

// Also export auth helpers used by the upload-image route
export { getAuthHeader, resolveCanonicalApiBase };

async function uploadFeaturedImage(
  client: Client,
  apiBase: string,
  imageUrl: string,
  postSlug: string,
  altText?: string
): Promise<number | null> {
  try {
    const authHeader = await getAuthHeader(client);

    // Download the image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to download image: ${imgRes.status}`);
    }
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const filename = `${postSlug}.${ext}`;
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Upload to WordPress media library
    const uploadRes = await fetch(`${apiBase}/media`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      throw new Error(`WP media upload failed (${uploadRes.status}): ${errText.slice(0, 300)}`);
    }

    const media: { id: number } = await uploadRes.json();

    // Set the alt text on the media attachment so WordPress renders
    // <img alt="…"> on the frontend automatically.
    if (altText && media.id) {
      try {
        await fetch(`${apiBase}/media/${media.id}`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ alt_text: altText }),
        });
      } catch { /* non-fatal — image still works without alt text */ }
    }

    return media.id;
  } catch (error) {
    // Re-throw so the caller can surface the real error message in the UI
    console.error("Featured image upload failed:", error);
    throw error;
  }
}

async function getOrCreateCategories(
  client: Client,
  apiBase: string,
  categoryNames: string[]
): Promise<number[]> {
  const authHeader = await getAuthHeader(client);

  const res = await fetch(`${apiBase}/categories?per_page=100`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch categories: ${res.status} ${res.statusText}`);
  }

  const existing: WordPressCategory[] = await res.json();

  // Only use categories that already exist on the site — never create new ones.
  // Deduplicate IDs so the same category is never assigned twice.
  const ids = categoryNames
    .map((name) => existing.find((c) => c.name.toLowerCase() === name.toLowerCase()))
    .filter((c): c is WordPressCategory => c !== undefined)
    .map((c) => c.id);
  return [...new Set(ids)];
}

async function getOrCreateTags(
  client: Client,
  apiBase: string,
  tagNames: string[]
): Promise<number[]> {
  const authHeader = await getAuthHeader(client);
  const tagIds: number[] = [];

  const res = await fetch(`${apiBase}/tags?per_page=100`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch tags: ${res.status} ${res.statusText}`);
  }

  const existing: Array<{ id: number; name: string; slug: string }> = await res.json();

  for (const name of tagNames) {
    const found = existing.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );

    if (found) {
      tagIds.push(found.id);
    } else {
      const createRes = await fetch(`${apiBase}/tags`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (createRes.ok) {
        const newTag: { id: number } = await createRes.json();
        tagIds.push(newTag.id);
      }
    }
  }

  return tagIds;
}

/**
 * Publish via the CS Publisher mu-plugin (wp-plugin/cs-publisher.php).
 *
 * One JSON POST creates the post, uploads the featured image, writes
 * categories/tags, and sets SEO meta. Auth is a shared-secret header
 * (X-CS-Secret), so Wordfence's Application Password block is irrelevant.
 */
async function publishViaCsPublisher(
  client: Client,
  post: BlogPost,
  publishAsDraft: boolean
): Promise<{ wordpressPostId: number; publishedUrl: string }> {
  // Build the set of origins to try (same strategy as testWordPressConnection):
  //   1. redirect-resolved canonical origin
  //   2. raw configured URL
  //   3. www-toggled variants (handles WP Engine per-hostname cache mismatches)
  const configured = client.wordpressUrl.replace(/\/+$/, "");
  let resolvedOrigin = configured;
  try {
    const canonical = await resolveCanonicalApiBase(client);
    resolvedOrigin = new URL(canonical).origin;
  } catch { /* fall back to configured */ }

  const toggleWww = (u: string): string => {
    try {
      const url = new URL(u);
      url.hostname = url.hostname.startsWith("www.")
        ? url.hostname.slice(4)
        : `www.${url.hostname}`;
      return url.origin;
    } catch { return u; }
  };

  const origins = Array.from(new Set([
    resolvedOrigin,
    configured,
    toggleWww(configured),
    toggleWww(resolvedOrigin),
  ]));

  // For each origin, try pretty URL × (header vs query-param auth), then rest_route × same.
  const encodedSecret = encodeURIComponent(client.csPublisherSecret!);
  const attempts: { url: string; useHeader: boolean }[] = [];
  for (const origin of origins) {
    attempts.push(
      { url: `${origin}/wp-json/cs-publisher/v1/publish`, useHeader: true },
      { url: `${origin}/wp-json/cs-publisher/v1/publish?cs_secret=${encodedSecret}`, useHeader: false },
      { url: `${origin}/?rest_route=/cs-publisher/v1/publish`, useHeader: true },
      { url: `${origin}/?rest_route=/cs-publisher/v1/publish&cs_secret=${encodedSecret}`, useHeader: false },
    );
  }

  const onPageH1 = post.h1 || post.title;
  const focusKeyword = post.targetKeywords?.[0] || "";

  const body = {
    title: onPageH1,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    status: publishAsDraft ? "draft" : "publish",
    categories: post.categories,
    // Tags intentionally omitted — themes render them at the bottom of posts
    // as a "related tags" strip which looks cluttered and amateurish.
    tags: [],
    featured_image: post.featuredImageUrl
      ? { url: post.featuredImageUrl, filename: `${post.slug || "featured"}.jpg`, alt: post.featuredImageAlt || post.title }
      : undefined,
    meta: {
      rank_math_title: post.title,
      rank_math_description: post.metaDescription,
      rank_math_focus_keyword: focusKeyword,
      _yoast_wpseo_title: post.title,
      _yoast_wpseo_metadesc: post.metaDescription,
      _yoast_wpseo_focuskw: focusKeyword,
    },
  };

  let res!: Response;
  let lastErrText = "";
  for (const { url, useHeader } of attempts) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (useHeader) headers["X-CS-Secret"] = client.csPublisherSecret!;

    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") || "(no Location)";
      throw new Error(`CS Publisher redirected to ${location} — update wordpressUrl to canonical origin.`);
    }

    // 404 rest_no_route — try next variant
    if (res.status === 404) {
      lastErrText = await res.text();
      continue;
    }
    // Any other status — use this response (ok or error)
    break;
  }

  if (!res.ok) {
    const errText = res.status === 404 ? lastErrText : await res.text();
    throw new Error(
      `CS Publisher failed: ${res.status} ${res.statusText} — ${errText.slice(0, 500)}`
    );
  }

  const parsed: { id?: number; link?: string; status?: string } = await res.json();
  if (typeof parsed.id !== "number" || typeof parsed.link !== "string") {
    throw new Error(
      `CS Publisher response missing id/link: ${JSON.stringify(parsed).slice(0, 200)}`
    );
  }
  if (!publishAsDraft && parsed.status !== "publish") {
    throw new Error(
      `CS Publisher returned status=${parsed.status} (expected "publish").`
    );
  }

  return { wordpressPostId: parsed.id, publishedUrl: parsed.link };
}

export async function publishToWordPress(
  client: Client,
  post: BlogPost,
  publishAsDraft = false
): Promise<{ wordpressPostId: number; publishedUrl: string }> {
  // When the client has a CS Publisher mu-plugin installed (Wordfence-locked
  // sites etc.), go through the custom endpoint instead of native WP REST.
  if (client.csPublisherSecret) {
    return publishViaCsPublisher(client, post, publishAsDraft);
  }

  const apiBase = await resolveCanonicalApiBase(client);
  const authHeader = await getAuthHeader(client);

  const [categoryIds, tagIds, featuredMediaId] = await Promise.all([
    getOrCreateCategories(client, apiBase, post.categories),
    getOrCreateTags(client, apiBase, post.tags),
    post.featuredImageUrl
      ? uploadFeaturedImage(client, apiBase, post.featuredImageUrl, post.slug, post.featuredImageAlt || post.title)
      : Promise.resolve(null),
  ]);

  // Separate on-page H1 from SEO <title> tag:
  // - WP post_title renders as the on-page H1 → use post.h1 if present
  // - Plugin "seo title" overrides the <title> tag → use post.title (the SEO title)
  const onPageH1 = post.h1 || post.title;
  const focusKeyword = post.targetKeywords?.[0] || "";

  // Send both RankMath and Yoast meta keys. Whichever plugin is installed
  // picks up its own keys; the other set is ignored harmlessly.
  const wpPost: Record<string, unknown> = {
    title: onPageH1,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    status: publishAsDraft ? "draft" : "publish",
    categories: categoryIds,
    tags: tagIds,
    meta: {
      // RankMath
      rank_math_title: post.title,
      rank_math_description: post.metaDescription,
      rank_math_focus_keyword: focusKeyword,
      // Yoast (fallback for clients still on Yoast)
      _yoast_wpseo_title: post.title,
      _yoast_wpseo_metadesc: post.metaDescription,
      _yoast_wpseo_focuskw: focusKeyword,
    },
  };

  if (featuredMediaId) {
    wpPost.featured_media = featuredMediaId;
  }

  // `redirect: "manual"` so an unexpected redirect surfaces here instead of
  // being silently converted POST→GET (dropping body + Authorization header).
  const res = await fetch(`${apiBase}/posts`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(wpPost),
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") || "(no Location header)";
    throw new Error(
      `WordPress redirected POST ${apiBase}/posts → ${location}. ` +
      `Update the client's wordpressUrl to the canonical origin.`
    );
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Failed to publish to WordPress: ${res.status} ${res.statusText} — ${errorText.slice(0, 500)}`
    );
  }

  const parsed: unknown = await res.json();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `WordPress returned a non-object response (got ${Array.isArray(parsed) ? "array" : typeof parsed}). ` +
      `This usually means the POST was rewritten to GET by a redirect.`
    );
  }
  const wpResponse = parsed as Partial<WordPressPostResponse>;
  if (typeof wpResponse.id !== "number" || typeof wpResponse.link !== "string") {
    throw new Error(
      `WordPress response missing id/link — got keys: ${Object.keys(wpResponse).join(", ")}`
    );
  }
  if (!publishAsDraft && wpResponse.status !== "publish") {
    throw new Error(
      `WordPress accepted the post but status=${wpResponse.status} (expected "publish"). ` +
      `Check that the app-password user has publish_posts capability.`
    );
  }

  return {
    wordpressPostId: wpResponse.id,
    publishedUrl: wpResponse.link,
  };
}

/**
 * Update the featured image on an already-published WordPress post.
 * Uses the CS Publisher plugin's update_image_only mode (requires the updated
 * plugin v1.1+). Falls back gracefully on older plugin versions.
 *
 * Returns { success, message } — never throws, so callers can batch safely.
 */
export async function syncFeaturedImageToWordPress(
  client: Client,
  post: BlogPost
): Promise<{ success: boolean; message: string }> {
  if (!post.wordpressPostId) {
    return { success: false, message: "No WordPress post ID — post may not have been published yet" };
  }
  if (!post.featuredImageUrl) {
    return { success: false, message: "No featured image URL to sync" };
  }

  // ── Routing ────────────────────────────────────────────────────────────────
  // Always prefer native WP REST when an app password is available — it's a
  // simple PATCH that only touches featured_media, no risk of wiping content.
  // CS Publisher is the fallback ONLY for clients that have no app password.
  if (client.wordpressAppPassword && client.wordpressUsername) {
    // Native WP REST path — upload image then PATCH featured_media on the post.
    let nativeError: string | null = null;
    try {
      const apiBase = await resolveCanonicalApiBase(client);
      const authHeader = await getAuthHeader(client);

      // Detect temp-image URLs (pasted/uploaded via dashboard) — Vercel can't
      // fetch its own endpoints (loopback fails), so read directly from KV.
      let featuredMediaId: number | null = null;
      const tempImageMatch = post.featuredImageUrl.match(/\/api\/blog-agent\/posts\/temp-image\?id=([^&]+)/);
      if (tempImageMatch) {
        const tempId = tempImageMatch[1];
        const { kv } = await import("@vercel/kv");
        const stored = await kv.get<{ base64: string; contentType: string; filename: string }>(`temp-image:${tempId}`);
        if (!stored) {
          return { success: false, message: "Uploaded image has expired or was not found. Please re-upload the image." };
        }
        const buffer = Buffer.from(stored.base64, "base64");
        const filename = stored.filename || `${post.slug || post.id}.jpg`;
        featuredMediaId = await uploadFeaturedImageBuffer(client, apiBase, buffer, stored.contentType, filename, post.featuredImageAlt || post.title);
      } else {
        featuredMediaId = await uploadFeaturedImage(client, apiBase, post.featuredImageUrl, post.slug, post.featuredImageAlt || post.title);
      }
      if (!featuredMediaId) {
        return { success: false, message: "Failed to upload image to WordPress media library" };
      }
      const res = await fetch(`${apiBase}/posts/${post.wordpressPostId}`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ featured_media: featuredMediaId }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, message: `WP REST error: ${res.status} — ${errText.slice(0, 200)}` };
      }
      const wpBody = await res.json().catch(() => ({})) as Record<string, unknown>;
      console.log(`[sync-images] WP PATCH response for post ${post.wordpressPostId}:`, JSON.stringify(wpBody).slice(0, 300));
      return { success: true, message: `Featured image (media ${featuredMediaId}) set on WP post ${post.wordpressPostId}` };
    } catch (err) {
      nativeError = err instanceof Error ? err.message : "Unknown error";
      // If it's a permission error (401/403) and CS Publisher is available, fall through to try that
      const isPermissionError = nativeError.includes("(401)") || nativeError.includes("(403)");
      if (!isPermissionError || !client.csPublisherSecret) {
        return { success: false, message: nativeError };
      }
      // Fall through to CS Publisher below
    }
  }

  // CS Publisher path — only reached when the client has NO app password.
  // Sends update_image_only so only the featured image is updated (requires plugin v1.1+).
  if (client.csPublisherSecret) {
    const configured = client.wordpressUrl.replace(/\/+$/, "");
    let resolvedOrigin = configured;
    try {
      const canonical = await resolveCanonicalApiBase(client);
      resolvedOrigin = new URL(canonical).origin;
    } catch { /* fall back */ }

    const toggleWww = (u: string): string => {
      try {
        const url = new URL(u);
        url.hostname = url.hostname.startsWith("www.")
          ? url.hostname.slice(4)
          : `www.${url.hostname}`;
        return url.origin;
      } catch { return u; }
    };

    const origins = Array.from(new Set([resolvedOrigin, configured, toggleWww(configured), toggleWww(resolvedOrigin)]));
    const encodedSecret = encodeURIComponent(client.csPublisherSecret);
    const attempts: { url: string; useHeader: boolean }[] = [];
    for (const origin of origins) {
      attempts.push(
        { url: `${origin}/wp-json/cs-publisher/v1/publish`, useHeader: true },
        { url: `${origin}/wp-json/cs-publisher/v1/publish?cs_secret=${encodedSecret}`, useHeader: false },
        { url: `${origin}/?rest_route=/cs-publisher/v1/publish`, useHeader: true },
        { url: `${origin}/?rest_route=/cs-publisher/v1/publish&cs_secret=${encodedSecret}`, useHeader: false },
      );
    }

    // Build the featured_image payload.
    // For temp-image URLs (pasted images stored in KV): also send the raw bytes
    // as base64 so the plugin v1.2+ can sideload without an extra HTTP roundtrip
    // and older plugin versions (v1.1) can fall back to the absolute URL.
    type FeaturedImagePayload = {
      url: string;
      data?: string;
      content_type?: string;
      filename: string;
      alt: string;
    };
    let featuredImagePayload: FeaturedImagePayload = {
      url: post.featuredImageUrl,
      filename: `pixabay-${post.freepikId || post.id}.jpg`,
      alt: post.featuredImageAlt || post.title,
    };
    const tempMatchCS = post.featuredImageUrl.match(/\/api\/blog-agent\/posts\/temp-image\?id=([^&]+)/);
    if (tempMatchCS) {
      const { kv } = await import("@vercel/kv");
      const stored = await kv.get<{ base64: string; contentType: string; filename: string }>(`temp-image:${tempMatchCS[1]}`);
      if (!stored) {
        return { success: false, message: "Uploaded image has expired or was not found. Please re-upload the image." };
      }
      featuredImagePayload = {
        url: post.featuredImageUrl,   // absolute URL — v1.1 plugin can download from this
        data: stored.base64,          // base64 — v1.2+ plugin prefers this (no extra HTTP)
        content_type: stored.contentType,
        filename: stored.filename || `${post.slug || post.id}.jpg`,
        alt: post.featuredImageAlt || post.title,
      };
    }

    const body = {
      post_id: post.wordpressPostId,
      update_image_only: true,
      featured_image: featuredImagePayload,
    };

    let res!: Response;
    for (const { url, useHeader } of attempts) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (useHeader) headers["X-CS-Secret"] = client.csPublisherSecret;
      res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), redirect: "manual" });
      if (res.status === 404) continue;
      break;
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text().catch(() => "") : "No response";
      // Detect old plugin versions that try to insert instead of updating image only
      if (errText.includes("cs_publisher_insert_failed")) {
        return { success: false, message: "CS Publisher plugin needs updating — please download the latest version from the Clients tab and reinstall" };
      }
      if (!res || res.status === 404) {
        return { success: false, message: "CS Publisher plugin not found — please install the updated plugin (v1.1+) from the Clients tab" };
      }
      return { success: false, message: `CS Publisher error: ${res.status} — ${errText.slice(0, 200)}` };
    }
    return { success: true, message: `Featured image updated on WP post ${post.wordpressPostId}` };
  }

  return { success: false, message: "No WordPress credentials configured — add an app password in the Clients tab to enable image sync" };
}

export async function testWordPressConnection(
  client: Client
): Promise<{ success: boolean; message: string }> {
  // CS Publisher path — ping the mu-plugin so the user sees which WP user
  // the plugin posts as, and get a clear error if the plugin is missing or
  // the secret is wrong.
  if (client.csPublisherSecret) {
    // Build the set of origins to try:
    //   1. redirect-resolved canonical origin (follow redirects)
    //   2. raw configured URL (if no redirect)
    //   3. www-toggled variant of configured (flip www. on/off)
    // Why #3: WP Engine caches WordPress's REST route list separately per
    // hostname. When a new plugin is installed, one hostname's cache refreshes
    // while the other stays stale for minutes. Testing both variants means we
    // find whichever version already sees the plugin.
    const configured = client.wordpressUrl.replace(/\/+$/, "");
    let resolvedOrigin = configured;
    try {
      const canonical = await resolveCanonicalApiBase(client);
      resolvedOrigin = new URL(canonical).origin;
    } catch { /* fall back to configured */ }

    const toggleWww = (u: string): string => {
      try {
        const url = new URL(u);
        url.hostname = url.hostname.startsWith("www.")
          ? url.hostname.slice(4)
          : `www.${url.hostname}`;
        return url.origin;
      } catch { return u; }
    };

    const origins = Array.from(new Set([
      resolvedOrigin,
      configured,
      toggleWww(configured),
      toggleWww(resolvedOrigin),
    ]));

    // For each origin, try 4 URL formats × 2 auth styles (header + query param).
    // Header is preferred (doesn't leak the secret in server logs). Query-param
    // is the fallback for Wordfence-hardened sites that drop custom headers.
    const encodedSecret = encodeURIComponent(client.csPublisherSecret);
    const attempts: { url: string; useHeader: boolean }[] = [];
    for (const origin of origins) {
      attempts.push(
        { url: `${origin}/wp-json/cs-publisher/v1/ping`, useHeader: true },
        { url: `${origin}/wp-json/cs-publisher/v1/ping?cs_secret=${encodedSecret}`, useHeader: false },
        { url: `${origin}/?rest_route=/cs-publisher/v1/ping`, useHeader: true },
        { url: `${origin}/?rest_route=/cs-publisher/v1/ping&cs_secret=${encodedSecret}`, useHeader: false },
      );
    }
    const seenKeys = new Set<string>();
    const attemptsToTry = attempts.filter((a) => {
      const key = `${a.url}|${a.useHeader}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    const urlsToTry = Array.from(new Set(attempts.map((a) => a.url)));

    // Capture the best-informed response across all attempts so we can
    // report a meaningful error instead of just "all failed".
    let bestErrStatus = 0;
    let bestErrBody = "";
    for (const { url: pingUrl, useHeader } of attemptsToTry) {
      try {
        const pingRes = await fetch(pingUrl, {
          headers: useHeader ? { "X-CS-Secret": client.csPublisherSecret } : {},
        });
        if (pingRes.ok) {
          const info: { user_login?: string; user_id?: number; version?: string } =
            await pingRes.json();
          return {
            success: true,
            message: `CS Publisher v${info.version ?? "?"} active — posting as ${info.user_login} (user #${info.user_id})`,
          };
        }
        // 401 means plugin IS registered, secret just doesn't match
        if (pingRes.status === 401) {
          return {
            success: false,
            message: `Plugin found but secret doesn't match — click Get Plugin to download a fresh installer and re-upload`,
          };
        }
        // Keep the best (highest-status, non-404) error body for diagnostics.
        // Prefer plugin-level errors (500 = unconfigured, etc.) over routing 404s.
        if (pingRes.status !== 404 && pingRes.status > bestErrStatus) {
          bestErrStatus = pingRes.status;
          bestErrBody = (await pingRes.text()).slice(0, 300);
        } else if (bestErrStatus === 0) {
          bestErrStatus = pingRes.status;
          bestErrBody = (await pingRes.text()).slice(0, 300);
        }
      } catch { /* network error, try next URL */ }
    }

    // If we got a plugin-level error (non-404), surface it directly — the
    // plugin responded, it just rejected us. Much clearer than "blocked".
    if (bestErrStatus && bestErrStatus !== 404) {
      return {
        success: false,
        message: `CS Publisher returned ${bestErrStatus}: ${bestErrBody}`,
      };
    }

    // Neither URL worked — diagnose by fetching:
    //   1. /wp-json/              → list of all registered namespaces
    //   2. /wp-json/cs-publisher/v1 → list of routes under our namespace
    // This tells us whether the plugin is loaded at all, and if so, which
    // routes it actually registered (vs the ones we're calling).
    let namespaceInfo = "";
    let hasNamespace = false;
    try {
      const nsRes = await fetch(`${configured}/wp-json/`, { redirect: "follow" });
      if (nsRes.ok) {
        const nsData: { namespaces?: string[] } = await nsRes.json();
        const ns = nsData.namespaces || [];
        hasNamespace = ns.includes("cs-publisher/v1");
        if (!hasNamespace) {
          namespaceInfo = ` — plugin NOT loaded (WP has: ${ns.slice(0, 10).join(", ")})`;
        }
      }
    } catch { /* ignore */ }

    if (hasNamespace) {
      // Namespace exists but /ping route is 404 — check what routes ARE there.
      try {
        const routesRes = await fetch(`${configured}/wp-json/cs-publisher/v1`, { redirect: "follow" });
        if (routesRes.ok) {
          const routesData: { routes?: Record<string, unknown> } = await routesRes.json();
          const routes = Object.keys(routesData.routes || {});
          namespaceInfo = routes.length
            ? ` — namespace exists but /ping blocked (routes found: ${routes.join(", ")}). Wordfence or similar is blocking the specific path.`
            : ` — namespace registered but NO routes under it. Plugin file has a PHP error; check WP error log.`;
        } else {
          namespaceInfo = ` — namespace exists but /cs-publisher/v1/ returned ${routesRes.status}. Wordfence or firewall is blocking the path.`;
        }
      } catch { /* ignore */ }
    }

    return {
      success: false,
      message: `Plugin not responding — tried: ${urlsToTry.join(" and ")}${namespaceInfo}`,
    };
  }

  try {
    const configured = getApiBase(client);
    const canonical = await resolveCanonicalApiBase(client);
    const authHeader = await getAuthHeader(client);

    // 1. Basic read check — any authenticated role can pass this.
    const readRes = await fetch(`${canonical}/posts?per_page=1`, {
      headers: { Authorization: authHeader },
    });
    if (!readRes.ok) {
      return {
        success: false,
        message: `Read check failed: ${readRes.status} ${readRes.statusText}`,
      };
    }

    // 2. Create-draft probe — exercises the `create_posts` capability (the same
    // check that `POST /posts` with status=publish triggers). We use draft so
    // nothing renders on the frontend even if cleanup fails. A low-privilege
    // user (Subscriber, Customer, etc.) will fail here with rest_cannot_create,
    // surfacing the real issue before a real publish attempt.
    const probeTitle = `CS Design Studios publish-capability test ${new Date().toISOString()} (safe to delete)`;
    const createRes = await fetch(`${canonical}/posts`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "draft",
        title: probeTitle,
        content: "<p>Automated capability check. Safe to delete.</p>",
      }),
      redirect: "manual",
    });

    if (createRes.status >= 300 && createRes.status < 400) {
      const location = createRes.headers.get("location") || "(no Location)";
      return {
        success: false,
        message: `POST redirected to ${location}. Canonical resolution missed — please report.`,
      };
    }
    if (!createRes.ok) {
      const errText = await createRes.text();
      return {
        success: false,
        message:
          `Publish-capability check failed: ${createRes.status} ${createRes.statusText} — ` +
          `${errText.slice(0, 300)}`,
      };
    }

    const created: { id?: number } = await createRes.json().catch(() => ({}));
    let cleanupNote = "";
    if (typeof created.id === "number") {
      // 3. Best-effort cleanup with force=true to skip trash.
      const deleteRes = await fetch(
        `${canonical}/posts/${created.id}?force=true`,
        { method: "DELETE", headers: { Authorization: authHeader } }
      );
      if (!deleteRes.ok) {
        cleanupNote = ` (warning: test draft #${created.id} could not be deleted — remove manually)`;
      }
    } else {
      cleanupNote = " (warning: WP accepted the draft but returned no id — no cleanup possible)";
    }

    if (configured !== canonical) {
      const canonicalOrigin = new URL(canonical).origin;
      return {
        success: true,
        message:
          `Connected and publish capability verified. Note: wordpressUrl redirects to ${canonicalOrigin} — ` +
          `consider updating the client record to skip the redirect probe.${cleanupNote}`,
      };
    }
    return {
      success: true,
      message: `Connected and publish capability verified.${cleanupNote}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
