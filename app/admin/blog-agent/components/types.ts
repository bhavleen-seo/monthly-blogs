export interface Client {
  id: string;
  name: string;
  businessName: string;
  industry: string;
  location: string;
  tone: string;
  keywords: string[];
  seoNotes: string;
  postsPerMonth: number;
  isActive: boolean;
  wordpressUrl: string;
  wordpressUsername: string;
  wordpressAppPassword?: string;
  hasWordpressPassword?: boolean;
  targetAudience: string;
  blogCategories: string[];
  websiteUrl: string;
}

export interface Topic {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string;
  targetKeywords: string[];
  estimatedSearchVolume: string;
  searchVolume?: number;
  keywordDifficulty?: number;
  cpc?: number;
  status: string;
  month: string;
  seoRationale?: string;
  topicalCluster?: string;
  rankingDifficulty?: "easy" | "medium" | "hard";
  supportsCommercialKeyword?: string;
  funnelStage?: "TOFU" | "MOFU" | "BOFU";
  internalLinkTarget?: string;
}

export interface Post {
  id: string;
  clientId: string;
  clientName: string;
  topicId: string;
  title: string;
  h1?: string;
  slug?: string;
  wordCount: number;
  status: string;
  publishedUrl?: string;
  content: string;
  excerpt: string;
  metaDescription: string;
  featuredImagePrompt?: string;
  featuredImageUrl?: string;
}

export type Tab = "dashboard" | "clients" | "topics" | "posts" | "settings" | "schedule";
