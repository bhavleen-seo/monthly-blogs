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
  tone: "professional" | "casual" | "friendly" | "authoritative" | "conversational";
  keywords: string[];
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
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  metaDescription: string;
  targetKeywords: string[];
  categories: string[];
  tags: string[];
  featuredImagePrompt: string;
  wordCount: number;
  status: "draft" | "ready" | "published" | "failed";
  wordpressPostId?: number;
  publishedUrl?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
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

export interface AgentStore {
  clients: Client[];
  topics: TopicSuggestion[];
  posts: BlogPost[];
  runs: AgentRun[];
  schedule: ScheduleConfig;
}
