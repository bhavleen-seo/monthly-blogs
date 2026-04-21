import { promises as fs } from "fs";
import path from "path";
import type { AgentStore, Client, TopicSuggestion, BlogPost, AgentRun, GlobalSettings, ScheduleConfig } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "blog-agent.json");

// ─── Separate KV keys per data type ─────────────────────────────────────────
// Old architecture: ONE key for everything → payload too large, race conditions,
// silent write failures. New: each data type has its own small key.
const KV = {
  SETTINGS:  "ba:settings",
  CLIENTS:   "ba:clients",
  TOPICS:    "ba:topics",
  POSTS:     "ba:posts",
  RUNS:      "ba:runs",
  SCHEDULE:  "ba:schedule",
  WPCREDS:   "ba:wpcreds", // encrypted WP creds per clientId + sync status
  OLD_STORE: "blog-agent-store", // legacy single-blob key for migration
} as const;

const DEFAULT_SETTINGS: GlobalSettings = {
  seoRules: "",
  contentInstructions: "",
  avoidTopics: "",
  preferredWordCount: { min: 1200, max: 1800 },
  model: "anthropic/claude-sonnet-4.5",
  researchModel: "",
  writerModel: "",
};

const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  researchDayOfMonth: 1,
  writeDayOfMonth: 10,
  publishDayOfMonth: 15,
  timezone: "Australia/Melbourne",
};

// ─── Storage backend ─────────────────────────────────────────────────────────

export function getStorageDiagnostics(): Record<string, unknown> {
  return {
    backend: useKV() ? "kv" : "file",
    hasKvRestApiUrl: !!process.env.KV_REST_API_URL,
    hasKvRestApiToken: !!process.env.KV_REST_API_TOKEN,
    hasRedisUrl: !!process.env.REDIS_URL,
    redisUrlHost: process.env.REDIS_URL
      ? (() => { try { return new URL(process.env.REDIS_URL).hostname; } catch { return "PARSE_FAILED"; } })()
      : null,
    architecture: "multi-key",
  };
}

function useKV(): boolean {
  return !!(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    process.env.REDIS_URL
  );
}

function parseRedisUrl(url: string): { url: string; token: string } | null {
  try {
    const parsed = new URL(url);
    const token = parsed.password;
    const host = parsed.hostname;
    if (!token || !host) return null;
    return { url: `https://${host}`, token };
  } catch {
    return null;
  }
}

type KVClient = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

async function getKV(): Promise<KVClient> {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import("@vercel/kv");
    return kv as KVClient;
  }
  if (process.env.REDIS_URL) {
    const creds = parseRedisUrl(process.env.REDIS_URL);
    if (creds) {
      const { createClient } = await import("@vercel/kv");
      return createClient(creds) as KVClient;
    }
    throw new Error("Failed to parse REDIS_URL");
  }
  throw new Error("No KV credentials found");
}

// ─── KV helpers: typed get/set per key ───────────────────────────────────────

async function kvGet<T>(key: string, fallback: T): Promise<T> {
  if (!useKV()) return fallback;
  try {
    const kv = await getKV();
    const val = await kv.get<T>(key);
    return val ?? fallback;
  } catch (err) {
    console.error(`[store] KV get "${key}" failed:`, err);
    throw new Error(`KV read error on "${key}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (!useKV()) return;
  try {
    const kv = await getKV();
    await kv.set(key, value);
  } catch (err) {
    console.error(`[store] KV set "${key}" failed:`, err);
    throw new Error(`KV write error on "${key}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── One-time migration from single-blob to multi-key ────────────────────────

let migrationDone = false;

async function migrateIfNeeded(): Promise<void> {
  if (!useKV() || migrationDone) return;
  migrationDone = true;

  try {
    const kv = await getKV();
    const old = await kv.get<AgentStore>(KV.OLD_STORE);
    if (!old) return; // nothing to migrate

    // Check if new keys already exist (migration already ran)
    const existing = await kv.get(KV.SETTINGS);
    if (existing) {
      // New format already exists — delete old blob to free space
      await kv.del(KV.OLD_STORE);
      return;
    }

    console.log("[store] Migrating from single-blob to multi-key...");
    await kv.set(KV.SETTINGS, old.globalSettings || DEFAULT_SETTINGS);
    await kv.set(KV.CLIENTS, old.clients || []);
    await kv.set(KV.TOPICS, old.topics || []);
    await kv.set(KV.POSTS, old.posts || []);
    await kv.set(KV.RUNS, (old.runs || []).slice(-50));
    await kv.set(KV.SCHEDULE, old.schedule || DEFAULT_SCHEDULE);
    await kv.del(KV.OLD_STORE);
    console.log("[store] Migration complete — old blob deleted");
  } catch (err) {
    console.error("[store] Migration failed (non-fatal):", err);
    // Non-fatal — worst case, user re-seeds/re-enters data
  }
}

// ─── File storage (local dev only) ──────────────────────────────────────────

async function ensureDataDir(): Promise<void> {
  try { await fs.access(DATA_DIR); } catch { await fs.mkdir(DATA_DIR, { recursive: true }); }
}

async function getFileStore(): Promise<AgentStore> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(STORE_FILE, "utf-8");
    return JSON.parse(data) as AgentStore;
  } catch {
    return {
      clients: [], topics: [], posts: [], runs: [],
      schedule: DEFAULT_SCHEDULE,
      globalSettings: DEFAULT_SETTINGS,
    };
  }
}

async function saveFileStore(store: AgentStore): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Legacy getStore/saveStore for backward compat ───────────────────────────
// Some code still calls these. They now assemble/disassemble from multi-key.

export async function getStore(): Promise<AgentStore> {
  if (!useKV()) return getFileStore();
  await migrateIfNeeded();
  const [globalSettings, clients, topics, posts, runs, schedule] = await Promise.all([
    kvGet<GlobalSettings>(KV.SETTINGS, DEFAULT_SETTINGS),
    kvGet<Client[]>(KV.CLIENTS, []),
    kvGet<TopicSuggestion[]>(KV.TOPICS, []),
    kvGet<BlogPost[]>(KV.POSTS, []),
    kvGet<AgentRun[]>(KV.RUNS, []),
    kvGet<ScheduleConfig>(KV.SCHEDULE, DEFAULT_SCHEDULE),
  ]);
  return { globalSettings, clients, topics, posts, runs, schedule };
}

export async function saveStore(store: AgentStore): Promise<void> {
  if (!useKV()) { await saveFileStore(store); return; }
  await Promise.all([
    kvSet(KV.SETTINGS, store.globalSettings),
    kvSet(KV.CLIENTS, store.clients),
    kvSet(KV.TOPICS, store.topics),
    kvSet(KV.POSTS, store.posts),
    kvSet(KV.RUNS, store.runs),
    kvSet(KV.SCHEDULE, store.schedule),
  ]);
}

// ─── Global Settings ─────────────────────────────────────────────────────────

export async function getGlobalSettings(): Promise<GlobalSettings> {
  if (!useKV()) return (await getFileStore()).globalSettings || DEFAULT_SETTINGS;
  await migrateIfNeeded();
  return kvGet<GlobalSettings>(KV.SETTINGS, DEFAULT_SETTINGS);
}

export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  if (!useKV()) {
    const store = await getFileStore();
    store.globalSettings = settings;
    await saveFileStore(store);
    return;
  }
  await kvSet(KV.SETTINGS, settings);
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  if (!useKV()) return (await getFileStore()).clients || [];
  await migrateIfNeeded();
  return kvGet<Client[]>(KV.CLIENTS, []);
}

export async function getClient(id: string): Promise<Client | undefined> {
  const clients = await getClients();
  return clients.find((c) => c.id === id);
}

export async function saveClient(client: Client): Promise<void> {
  const clients = await getClients();
  const index = clients.findIndex((c) => c.id === client.id);
  if (index >= 0) { clients[index] = client; } else { clients.push(client); }
  if (useKV()) { await kvSet(KV.CLIENTS, clients); }
  else {
    const store = await getFileStore();
    store.clients = clients;
    await saveFileStore(store);
  }
}

export async function deleteClient(id: string): Promise<void> {
  const clients = (await getClients()).filter((c) => c.id !== id);
  if (useKV()) { await kvSet(KV.CLIENTS, clients); }
  else {
    const store = await getFileStore();
    store.clients = clients;
    await saveFileStore(store);
  }
}

// ─── Topics ──────────────────────────────────────────────────────────────────

export async function getTopics(filters?: {
  clientId?: string;
  status?: string;
  month?: string;
}): Promise<TopicSuggestion[]> {
  let topics: TopicSuggestion[];
  if (useKV()) {
    await migrateIfNeeded();
    topics = await kvGet<TopicSuggestion[]>(KV.TOPICS, []);
  } else {
    topics = (await getFileStore()).topics || [];
  }
  if (filters?.clientId) topics = topics.filter((t) => t.clientId === filters.clientId);
  if (filters?.status) topics = topics.filter((t) => t.status === filters.status);
  if (filters?.month) topics = topics.filter((t) => t.month === filters.month);
  return topics;
}

async function saveTopics(topics: TopicSuggestion[]): Promise<void> {
  if (useKV()) { await kvSet(KV.TOPICS, topics); }
  else {
    const store = await getFileStore();
    store.topics = topics;
    await saveFileStore(store);
  }
}

export async function saveTopic(topic: TopicSuggestion): Promise<void> {
  const all = await getTopics();
  const index = all.findIndex((t) => t.id === topic.id);
  if (index >= 0) { all[index] = topic; } else { all.push(topic); }
  await saveTopics(all);
}

export async function deleteTopicsByClient(clientId: string, status?: string): Promise<number> {
  const all = await getTopics();
  const filtered = all.filter((t) => {
    if (t.clientId !== clientId) return true;
    if (status && t.status !== status) return true;
    return false;
  });
  const deleted = all.length - filtered.length;
  await saveTopics(filtered);
  return deleted;
}

export async function deleteTopic(id: string): Promise<boolean> {
  const all = await getTopics();
  const filtered = all.filter((t) => t.id !== id);
  if (filtered.length === all.length) return false;
  await saveTopics(filtered);
  return true;
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function getPosts(filters?: {
  clientId?: string;
  status?: string;
}): Promise<BlogPost[]> {
  let posts: BlogPost[];
  if (useKV()) {
    await migrateIfNeeded();
    posts = await kvGet<BlogPost[]>(KV.POSTS, []);
  } else {
    posts = (await getFileStore()).posts || [];
  }
  if (filters?.clientId) posts = posts.filter((p) => p.clientId === filters.clientId);
  if (filters?.status) posts = posts.filter((p) => p.status === filters.status);
  return posts;
}

async function savePosts(posts: BlogPost[]): Promise<void> {
  if (useKV()) { await kvSet(KV.POSTS, posts); }
  else {
    const store = await getFileStore();
    store.posts = posts;
    await saveFileStore(store);
  }
}

export async function getPost(id: string): Promise<BlogPost | undefined> {
  const posts = await getPosts();
  return posts.find((p) => p.id === id);
}

export async function savePost(post: BlogPost): Promise<void> {
  const all = await getPosts();
  const index = all.findIndex((p) => p.id === post.id);
  if (index >= 0) { all[index] = post; } else { all.push(post); }
  await savePosts(all);
}

export async function deletePost(id: string): Promise<boolean> {
  const all = await getPosts();
  const filtered = all.filter((p) => p.id !== id);
  if (filtered.length === all.length) return false;
  await savePosts(filtered);
  return true;
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export async function addRun(run: AgentRun): Promise<void> {
  let runs: AgentRun[];
  if (useKV()) { runs = await kvGet<AgentRun[]>(KV.RUNS, []); }
  else { runs = (await getFileStore()).runs || []; }
  runs.push(run);
  if (runs.length > 100) runs = runs.slice(-100);
  if (useKV()) { await kvSet(KV.RUNS, runs); }
  else {
    const store = await getFileStore();
    store.runs = runs;
    await saveFileStore(store);
  }
}

export async function updateRun(id: string, updates: Partial<AgentRun>): Promise<void> {
  let runs: AgentRun[];
  if (useKV()) { runs = await kvGet<AgentRun[]>(KV.RUNS, []); }
  else { runs = (await getFileStore()).runs || []; }
  const index = runs.findIndex((r) => r.id === id);
  if (index >= 0) {
    runs[index] = { ...runs[index], ...updates };
    if (useKV()) { await kvSet(KV.RUNS, runs); }
    else {
      const store = await getFileStore();
      store.runs = runs;
      await saveFileStore(store);
    }
  }
}

export async function getRuns(limit = 20): Promise<AgentRun[]> {
  let runs: AgentRun[];
  if (useKV()) { runs = await kvGet<AgentRun[]>(KV.RUNS, []); }
  else { runs = (await getFileStore()).runs || []; }
  return runs.slice(-limit).reverse();
}

// ─── Encrypted WP credentials (from Bitwarden sync) ─────────────────────────
// Stored as a single blob keyed by clientId for atomic updates.

import type { EncryptedBlob } from "./credentials";

export interface EncryptedWpCredEntry {
  clientId: string;
  clientName: string;
  bitwardenItemId: string;
  bitwardenItemName: string;
  username: EncryptedBlob;
  password: EncryptedBlob;
  uri: string | null;
  updatedAt: string;
}

export interface WpCredsStore {
  lastSyncAt: string | null;
  lastSyncError: string | null;
  /** Client IDs that had no matching Bitwarden item at last sync */
  unmatchedClientIds: string[];
  /** Bitwarden item names that didn't match any client (by business name) */
  unmatchedItemNames: string[];
  entries: EncryptedWpCredEntry[];
}

const EMPTY_WPCREDS: WpCredsStore = {
  lastSyncAt: null,
  lastSyncError: null,
  unmatchedClientIds: [],
  unmatchedItemNames: [],
  entries: [],
};

export async function getWpCredsStore(): Promise<WpCredsStore> {
  if (!useKV()) return EMPTY_WPCREDS;
  return kvGet<WpCredsStore>(KV.WPCREDS, EMPTY_WPCREDS);
}

export async function saveWpCredsStore(store: WpCredsStore): Promise<void> {
  if (!useKV()) return;
  await kvSet(KV.WPCREDS, store);
}

export async function getWpCredEntry(clientId: string): Promise<EncryptedWpCredEntry | undefined> {
  const store = await getWpCredsStore();
  return store.entries.find((e) => e.clientId === clientId);
}

// ─── Schedule ────────────────────────────────────────────────────────────────
// Used by getStore/saveStore for backward compat — schedule tab calls those.
