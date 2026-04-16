import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion, BlogPost } from "./types";
import { getGlobalSettings } from "./store";
import { complete } from "./llm";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function writeBlogPost(
  client: Client,
  topic: TopicSuggestion
): Promise<BlogPost> {
  const settings = await getGlobalSettings();
  const { min: minWords, max: maxWords } = settings.preferredWordCount;

  const globalRulesSection = [
    settings.seoRules && `## SEO Rules (MUST follow)\n${settings.seoRules}`,
    settings.contentInstructions && `## Content Instructions (MUST follow)\n${settings.contentInstructions}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `You are an expert blog writer at CS Design Studios. Write a complete, SEO-optimized blog post.

${globalRulesSection}

## Client Profile
- **Business:** ${client.businessName}
- **Industry:** ${client.industry}
- **Target Audience:** ${client.targetAudience}
- **Location:** ${client.location}
- **Brand Tone:** ${client.tone}

## Blog Topic
- **Title:** ${topic.title}
- **Description:** ${topic.description}
- **Target Keywords:** ${topic.targetKeywords.join(", ")}

## Requirements
1. Write ${minWords}-${maxWords} words of high-quality, engaging content
2. Use proper HTML formatting (h2, h3, p, ul, ol, strong, em tags)
3. Include the target keywords naturally (1-2% keyword density)
4. Structure with clear headings and subheadings
5. Include an engaging introduction that hooks the reader
6. Add a strong conclusion with a call-to-action relevant to ${client.businessName}
7. Write in a ${client.tone} tone
8. Make it locally relevant to ${client.location} where appropriate
9. Include practical, actionable advice
10. Do NOT include the h1 title — WordPress adds that automatically

Also provide:
- **Excerpt** (150-160 character summary for search results)
- **Meta Description** (150-160 characters, includes primary keyword)
- **Tags** (5-8 relevant tags)
- **Featured Image Prompt** (description for generating a featured image)

Respond in JSON format:
{
  "content": "<h2>...</h2><p>...</p>...",
  "excerpt": "...",
  "metaDescription": "...",
  "tags": ["...", "..."],
  "featuredImagePrompt": "..."
}

Return ONLY the JSON object, no other text.`;

  const text = await complete({
    model: settings.model || "anthropic/claude-sonnet-4.5",
    prompt,
    maxTokens: 8192,
  });

  let parsed: {
    content: string;
    excerpt: string;
    metaDescription: string;
    tags: string[];
    featuredImagePrompt: string;
  };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed) throw new Error("No JSON found");
  } catch {
    throw new Error(`Failed to parse blog post: ${text.slice(0, 200)}`);
  }

  const wordCount = parsed.content.replace(/<[^>]*>/g, "").split(/\s+/).length;

  return {
    id: uuidv4(),
    clientId: client.id,
    topicId: topic.id,
    title: topic.title,
    slug: generateSlug(topic.title),
    content: parsed.content,
    excerpt: parsed.excerpt,
    metaDescription: parsed.metaDescription,
    targetKeywords: topic.targetKeywords,
    categories: client.blogCategories,
    tags: parsed.tags,
    featuredImagePrompt: parsed.featuredImagePrompt,
    wordCount,
    status: "ready",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
