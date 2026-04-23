import type { Client, BlogPost } from "./types";
import { getWpCredEntry } from "./store";
import { decrypt } from "./credentials";

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
 * Resolve the WP username/password for a client. Prefers encrypted creds
 * synced from Bitwarden (KV key ba:wpcreds). Falls back to the plaintext
 * fields on the client record if no Bitwarden match exists.
 */
async function getAuthHeader(client: Client): Promise<string> {
  let username = client.wordpressUsername;
  let password = client.wordpressAppPassword || "";
  try {
    const entry = await getWpCredEntry(client.id);
    if (entry) {
      username = decrypt(entry.username);
      password = decrypt(entry.password);
    }
  } catch (err) {
    console.error(`[publisher] Failed to decrypt creds for ${client.businessName}, falling back to stored:`, err);
  }
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

async function uploadFeaturedImage(
  client: Client,
  apiBase: string,
  imageUrl: string,
  postSlug: string
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
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload image: ${uploadRes.status} ${errText.slice(0, 200)}`);
    }

    const media: { id: number } = await uploadRes.json();
    return media.id;
  } catch (error) {
    console.error("Featured image upload failed:", error);
    return null;
  }
}

async function getOrCreateCategories(
  client: Client,
  apiBase: string,
  categoryNames: string[]
): Promise<number[]> {
  const authHeader = await getAuthHeader(client);
  const categoryIds: number[] = [];

  const res = await fetch(`${apiBase}/categories?per_page=100`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch categories: ${res.status} ${res.statusText}`);
  }

  const existing: WordPressCategory[] = await res.json();

  for (const name of categoryNames) {
    const found = existing.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );

    if (found) {
      categoryIds.push(found.id);
    } else {
      const createRes = await fetch(`${apiBase}/categories`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (createRes.ok) {
        const newCat: WordPressCategory = await createRes.json();
        categoryIds.push(newCat.id);
      }
    }
  }

  return categoryIds;
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
  // Prefer the redirect-resolved origin; fall back to the configured URL.
  const configured = client.wordpressUrl.replace(/\/+$/, "");
  let origin = configured;
  try {
    const canonical = await resolveCanonicalApiBase(client);
    origin = new URL(canonical).origin;
  } catch { /* fall back to configured */ }

  // Try 4 variants: pretty URL × (header vs query-param auth), then rest_route × same.
  // Header is preferred; query-param is the fallback for sites where Wordfence
  // or similar drops requests with custom auth headers.
  const encodedSecret = encodeURIComponent(client.csPublisherSecret!);
  const attempts: { url: string; useHeader: boolean }[] = [
    { url: `${origin}/wp-json/cs-publisher/v1/publish`, useHeader: true },
    { url: `${origin}/wp-json/cs-publisher/v1/publish?cs_secret=${encodedSecret}`, useHeader: false },
    { url: `${origin}/?rest_route=/cs-publisher/v1/publish`, useHeader: true },
    { url: `${origin}/?rest_route=/cs-publisher/v1/publish&cs_secret=${encodedSecret}`, useHeader: false },
  ];

  const onPageH1 = post.h1 || post.title;
  const focusKeyword = post.targetKeywords?.[0] || "";

  const body = {
    title: onPageH1,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    status: publishAsDraft ? "draft" : "publish",
    categories: post.categories,
    tags: post.tags,
    featured_image: post.featuredImageUrl
      ? { url: post.featuredImageUrl, filename: `${post.slug || "featured"}.jpg` }
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
      ? uploadFeaturedImage(client, apiBase, post.featuredImageUrl, post.slug)
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

export async function testWordPressConnection(
  client: Client
): Promise<{ success: boolean; message: string }> {
  // CS Publisher path — ping the mu-plugin so the user sees which WP user
  // the plugin posts as, and get a clear error if the plugin is missing or
  // the secret is wrong.
  if (client.csPublisherSecret) {
    // Try two URLs: (1) the redirect-resolved canonical origin, (2) the raw
    // configured URL. This catches cases where the redirect resolver lands on
    // the wrong host (CDN, staging, etc.) while the plugin lives on the
    // configured URL.
    const configured = client.wordpressUrl.replace(/\/+$/, "");
    let resolvedOrigin = configured;
    try {
      const canonical = await resolveCanonicalApiBase(client);
      resolvedOrigin = new URL(canonical).origin;
    } catch { /* fall back to configured */ }

    // Try 4 URL formats × 2 auth styles (header + query param) in order:
    //   - Pretty permalink with X-CS-Secret header
    //   - Pretty permalink with ?cs_secret= query param (WAF fallback)
    //   - Query-string rest_route with header
    //   - Query-string rest_route with cs_secret in URL
    // Header is preferred (doesn't leak the secret in server logs). Query-param
    // is the fallback for Wordfence-hardened sites that drop custom headers.
    const encodedSecret = encodeURIComponent(client.csPublisherSecret);
    const attempts: { url: string; useHeader: boolean }[] = [
      { url: `${resolvedOrigin}/wp-json/cs-publisher/v1/ping`, useHeader: true },
      { url: `${resolvedOrigin}/wp-json/cs-publisher/v1/ping?cs_secret=${encodedSecret}`, useHeader: false },
      { url: `${configured}/wp-json/cs-publisher/v1/ping`, useHeader: true },
      { url: `${configured}/wp-json/cs-publisher/v1/ping?cs_secret=${encodedSecret}`, useHeader: false },
      { url: `${resolvedOrigin}/?rest_route=/cs-publisher/v1/ping`, useHeader: true },
      { url: `${resolvedOrigin}/?rest_route=/cs-publisher/v1/ping&cs_secret=${encodedSecret}`, useHeader: false },
      { url: `${configured}/?rest_route=/cs-publisher/v1/ping`, useHeader: true },
      { url: `${configured}/?rest_route=/cs-publisher/v1/ping&cs_secret=${encodedSecret}`, useHeader: false },
    ];
    const seenKeys = new Set<string>();
    const attemptsToTry = attempts.filter((a) => {
      const key = `${a.url}|${a.useHeader}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    const urlsToTry = Array.from(new Set(attempts.map((a) => a.url)));

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
        // 404 rest_no_route — plugin not loaded on this URL, try next
      } catch { /* network error, try next URL */ }
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
