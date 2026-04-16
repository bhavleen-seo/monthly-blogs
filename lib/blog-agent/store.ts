import { promises as fs } from "fs";
import path from "path";
import type { AgentStore, Client, TopicSuggestion, BlogPost, AgentRun, GlobalSettings } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "blog-agent.json");
const KV_KEY = "blog-agent-store";

const DEFAULT_STORE: AgentStore = {
  clients: [],
  topics: [],
  posts: [],
  runs: [],
  schedule: {
    enabled: false,
    researchDayOfMonth: 1,
    writeDayOfMonth: 10,
    publishDayOfMonth: 15,
    timezone: "Australia/Melbourne",
  },
  globalSettings: {
    seoRules: "",
    contentInstructions: "",
    avoidTopics: "",
    preferredWordCount: { min: 1200, max: 1800 },
    model: "anthropic/claude-sonnet-4.5",
  },
};

// Use Vercel KV if available (production), otherwise use file storage (local dev)
function useKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function getStore(): Promise<AgentStore> {
  if (useKV()) {
    const kv = await getKV();
    const store = await kv.get<AgentStore>(KV_KEY);
    if (store) {
      if (!store.globalSettings) {
        store.globalSettings = DEFAULT_STORE.globalSettings;
        await saveStore(store);
      }
      return store;
    }
    await saveStore(DEFAULT_STORE);
    return DEFAULT_STORE;
  }

  // File storage fallback for local dev
  await ensureDataDir();
  try {
    const data = await fs.readFile(STORE_FILE, "utf-8");
    const store = JSON.parse(data) as AgentStore;
    if (!store.globalSettings) {
      store.globalSettings = DEFAULT_STORE.globalSettings;
      await saveStore(store);
    }
    return store;
  } catch {
    await saveStore(DEFAULT_STORE);
    return DEFAULT_STORE;
  }
}

export async function saveStore(store: AgentStore): Promise<void> {
  if (useKV()) {
    const kv = await getKV();
    await kv.set(KV_KEY, store);
    return;
  }

  await ensureDataDir();
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const store = await getStore();
  return store.globalSettings;
}

export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  const store = await getStore();
  store.globalSettings = settings;
  await saveStore(store);
}

export async function getClients(): Promise<Client[]> {
  const store = await getStore();
  return store.clients;
}

export async function getClient(id: string): Promise<Client | undefined> {
  const store = await getStore();
  return store.clients.find((c) => c.id === id);
}

export async function saveClient(client: Client): Promise<void> {
  const store = await getStore();
  const index = store.clients.findIndex((c) => c.id === client.id);
  if (index >= 0) {
    store.clients[index] = client;
  } else {
    store.clients.push(client);
  }
  await saveStore(store);
}

export async function deleteClient(id: string): Promise<void> {
  const store = await getStore();
  store.clients = store.clients.filter((c) => c.id !== id);
  await saveStore(store);
}

export async function getTopics(filters?: {
  clientId?: string;
  status?: string;
  month?: string;
}): Promise<TopicSuggestion[]> {
  const store = await getStore();
  let topics = store.topics;
  if (filters?.clientId) topics = topics.filter((t) => t.clientId === filters.clientId);
  if (filters?.status) topics = topics.filter((t) => t.status === filters.status);
  if (filters?.month) topics = topics.filter((t) => t.month === filters.month);
  return topics;
}

export async function saveTopic(topic: TopicSuggestion): Promise<void> {
  const store = await getStore();
  const index = store.topics.findIndex((t) => t.id === topic.id);
  if (index >= 0) {
    store.topics[index] = topic;
  } else {
    store.topics.push(topic);
  }
  await saveStore(store);
}

export async function deleteTopicsByClient(clientId: string, status?: string): Promise<number> {
  const store = await getStore();
  const before = store.topics.length;
  store.topics = store.topics.filter((t) => {
    if (t.clientId !== clientId) return true;
    if (status && t.status !== status) return true;
    return false;
  });
  const deleted = before - store.topics.length;
  await saveStore(store);
  return deleted;
}

export async function getPosts(filters?: {
  clientId?: string;
  status?: string;
}): Promise<BlogPost[]> {
  const store = await getStore();
  let posts = store.posts;
  if (filters?.clientId) posts = posts.filter((p) => p.clientId === filters.clientId);
  if (filters?.status) posts = posts.filter((p) => p.status === filters.status);
  return posts;
}

export async function getPost(id: string): Promise<BlogPost | undefined> {
  const store = await getStore();
  return store.posts.find((p) => p.id === id);
}

export async function savePost(post: BlogPost): Promise<void> {
  const store = await getStore();
  const index = store.posts.findIndex((p) => p.id === post.id);
  if (index >= 0) {
    store.posts[index] = post;
  } else {
    store.posts.push(post);
  }
  await saveStore(store);
}

export async function addRun(run: AgentRun): Promise<void> {
  const store = await getStore();
  store.runs.push(run);
  if (store.runs.length > 100) {
    store.runs = store.runs.slice(-100);
  }
  await saveStore(store);
}

export async function updateRun(id: string, updates: Partial<AgentRun>): Promise<void> {
  const store = await getStore();
  const index = store.runs.findIndex((r) => r.id === id);
  if (index >= 0) {
    store.runs[index] = { ...store.runs[index], ...updates };
    await saveStore(store);
  }
}

export async function getRuns(limit = 20): Promise<AgentRun[]> {
  const store = await getStore();
  return store.runs.slice(-limit).reverse();
}
