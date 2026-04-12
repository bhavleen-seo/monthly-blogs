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
  status: string;
  month: string;
}

export interface Post {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  wordCount: number;
  status: string;
  publishedUrl?: string;
  content: string;
  excerpt: string;
  metaDescription: string;
}

export type Tab = "dashboard" | "clients" | "topics" | "posts" | "settings" | "schedule";
