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

function getAuthHeader(client: Client): string {
  const credentials = `${client.wordpressUsername}:${client.wordpressAppPassword}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function getApiBase(client: Client): string {
  const base = client.wordpressUrl.replace(/\/+$/, "");
  return `${base}/wp-json/wp/v2`;
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
    const authHeader = getAuthHeader(client);
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
  imageUrl: string,
  postSlug: string
): Promise<number | null> {
  try {
    const apiBase = getApiBase(client);
    const authHeader = getAuthHeader(client);

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
  categoryNames: string[]
): Promise<number[]> {
  const apiBase = getApiBase(client);
  const authHeader = getAuthHeader(client);
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
  tagNames: string[]
): Promise<number[]> {
  const apiBase = getApiBase(client);
  const authHeader = getAuthHeader(client);
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

export async function publishToWordPress(
  client: Client,
  post: BlogPost,
  publishAsDraft = false
): Promise<{ wordpressPostId: number; publishedUrl: string }> {
  const apiBase = getApiBase(client);
  const authHeader = getAuthHeader(client);

  const [categoryIds, tagIds, featuredMediaId] = await Promise.all([
    getOrCreateCategories(client, post.categories),
    getOrCreateTags(client, post.tags),
    post.featuredImageUrl
      ? uploadFeaturedImage(client, post.featuredImageUrl, post.slug)
      : Promise.resolve(null),
  ]);

  const wpPost: Record<string, unknown> = {
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    status: publishAsDraft ? "draft" : "publish",
    categories: categoryIds,
    tags: tagIds,
    meta: {
      _yoast_wpseo_metadesc: post.metaDescription,
    },
  };

  if (featuredMediaId) {
    wpPost.featured_media = featuredMediaId;
  }

  const res = await fetch(`${apiBase}/posts`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(wpPost),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Failed to publish to WordPress: ${res.status} ${res.statusText} — ${errorText}`
    );
  }

  const wpResponse: WordPressPostResponse = await res.json();

  return {
    wordpressPostId: wpResponse.id,
    publishedUrl: wpResponse.link,
  };
}

export async function testWordPressConnection(
  client: Client
): Promise<{ success: boolean; message: string }> {
  try {
    const apiBase = getApiBase(client);
    const authHeader = getAuthHeader(client);

    const res = await fetch(`${apiBase}/posts?per_page=1`, {
      headers: { Authorization: authHeader },
    });

    if (res.ok) {
      return { success: true, message: "Successfully connected to WordPress" };
    }
    return {
      success: false,
      message: `Connection failed: ${res.status} ${res.statusText}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
