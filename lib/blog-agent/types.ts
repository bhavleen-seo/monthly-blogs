export interface Client {
  id: string;
  name: string;
  businessName: string;
  industry: string;
  targetAudience: string;
  location: string;
  websiteUrl: string;
  wordpressUrl: string;
  wordpressUsername: string;
  wordpressAppPassword: string;
  /**
   * Shared secret for the CS Publisher mu-plugin
   * (wp-plugin/cs-publisher.php). When set, publishing uses the custom
   * /wp-json/cs-publisher/v1/publish endpoint instead of native WP REST.
   * Use this when Wordfence (or any other plugin) has blocked app passwords.
   */
  csPublisherSecret?: string;
  tone: "professional" | "casual" | "friendly" | "authoritative" | "conversational";
  keywords: string[];
  seoNotes: string;
  blogCategories: string[];
  postsPerMonth: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TopicSuggestion {
  id: string;
  clientId: string;
  title: string;
  description: string;
  targetKeywords: string[];
  estimatedSearchVolume: "high" | "medium" | "low";
  /** Real monthly search volume from SEMrush (when available) */
  searchVolume?: number;
  /** Real keyword difficulty 0-100 from SEMrush (when available) */
  keywordDifficulty?: number;
  /** Cost per click in USD from SEMrush (when available) */
  cpc?: number;
  /** Why this topic can rank + how it builds topical authority */
  seoRationale?: string;
  /** The topical cluster/pillar this post belongs to */
  topicalCluster?: string;
  /** Expected difficulty to rank on page 1 */
  rankingDifficulty?: "easy" | "medium" | "hard";
  /** Which commercial (money) keyword this informational post supports */
  supportsCommercialKeyword?: string;
  /** Where in the buyer journey this post sits */
  funnelStage?: "TOFU" | "MOFU" | "BOFU";
  /** Recommended URL on the client's site to internal-link to from this post */
  internalLinkTarget?: string;
  status: "pending" | "approved" | "rejected";
  month: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface BlogPost {
  id: string;
  clientId: string;
  topicId: string;
  /** SEO page title — used as the <title> tag / Yoast SEO title */
  title: string;
  /** On-page H1 heading — what readers see at the top of the post. Distinct from SEO title for best-practice SEO. Falls back to title if absent. */
  h1?: string;
  slug: string;
  content: string;
  excerpt: string;
  metaDescription: string;
  targetKeywords: string[];
  categories: string[];
  tags: string[];
  featuredImagePrompt: string;
  featuredImageUrl?: string;
  /** Freepik resource ID used for the featured image. Tracked to prevent
   *  the same image being reused across monthly posts for the same client. */
  freepikId?: string | number;
  /** SEO-friendly alt text for the featured image. Stored on the post for reference; not pushed to WordPress (the current plugin doesn't support attachment alt). Manually copy into WP admin if needed. */
  featuredImageAlt?: string;
  wordCount: number;
  status: "draft" | "ready" | "published" | "failed";
  wordpressPostId?: number;
  publishedUrl?: string;
  publishedAt?: string;
  /** AI-tell phrases detected in content after sanitization. Empty/absent = clean. */
  aiTellsDetected?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ClientSiteProfile {
  clientId: string;
  /** The websiteUrl that was analyzed — used to detect if the URL changed and a re-analysis is needed */
  websiteUrl: string;
  /** 2-3 sentence summary of what the business does */
  summary: string;
  /** Main service offerings extracted from the site */
  services: string[];
  /** Commercial keywords auto-derived from the site content */
  keywords: string[];
  /** Positioning / SEO notes for the researcher to follow */
  seoNotes: string;
  analyzedAt: string;
}

export interface AgentRun {
  id: string;
  type: "research" | "write" | "publish";
  clientId?: string;
  status: "running" | "completed" | "failed";
  message: string;
  details?: string;
  startedAt: string;
  completedAt?: string;
}

export interface ScheduleConfig {
  enabled: boolean;
  researchDayOfMonth: number;
  writeDayOfMonth: number;
  publishDayOfMonth: number;
  timezone: string;
}

export interface GlobalSettings {
  seoRules: string;
  contentInstructions: string;
  avoidTopics: string;
  preferredWordCount: { min: number; max: number };
  /** @deprecated Use researchModel / writerModel instead */
  model: string;
  researchModel?: string;
  writerModel?: string;
}

export interface AgentStore {
  clients: Client[];
  topics: TopicSuggestion[];
  posts: BlogPost[];
  runs: AgentRun[];
  schedule: ScheduleConfig;
  globalSettings: GlobalSettings;
}
