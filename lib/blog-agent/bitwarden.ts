/**
 * Bitwarden CLI wrapper.
 *
 * Runs `bw` from node_modules/@bitwarden/cli as a child process to pull client
 * WordPress credentials from the company Bitwarden vault. Used by the
 * sync-credentials endpoint to refresh encrypted creds in KV.
 *
 * Required env vars:
 *   BW_CLIENTID     — Bitwarden personal API client_id (user.xxx)
 *   BW_CLIENTSECRET — Bitwarden personal API client_secret
 *   BW_PASSWORD     — Bitwarden master password (to unlock the vault)
 *
 * Each invocation does: login (via API key) → unlock (via master password)
 * → sync → list items → logout. Session state goes to /tmp on Vercel since
 * the rest of the filesystem is read-only.
 */

import { spawn } from "child_process";
import path from "path";

export interface BitwardenLogin {
  username?: string;
  password?: string;
  uris?: Array<{ uri: string }>;
}

export interface BitwardenItem {
  object: "item";
  id: string;
  name: string;
  type: number; // 1 = login
  login?: BitwardenLogin;
  folderId?: string | null;
  collectionIds?: string[];
}

const TMP_APPDATA = "/tmp/.bitwarden";

function resolveBwPath(): string {
  // @bitwarden/cli installs a JS entry at node_modules/@bitwarden/cli/build/bw.js
  // We invoke via `node <path>` instead of the .bin symlink so it works the same
  // in Vercel's serverless bundle.
  return path.join(process.cwd(), "node_modules", "@bitwarden", "cli", "build", "bw.js");
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runBw(
  args: string[],
  opts: { env?: Record<string, string>; input?: string } = {}
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [resolveBwPath(), ...args, "--nointeraction"], {
      env: {
        ...process.env,
        BITWARDENCLI_APPDATA_DIR: TMP_APPDATA,
        ...opts.env,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));

    if (opts.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

/**
 * Pull all items whose name begins with "WordPress" from the vault.
 * Returns the raw Bitwarden items — callers decide how to match them to clients.
 *
 * NOTE: @bitwarden/cli has native deps that can't build in Vercel's serverless
 * sandbox. The sync is performed by a GitHub Action instead, which POSTs
 * encrypted creds to /api/blog-agent/receive-credentials. This function
 * is kept for local dev / self-hosted use.
 *
 * Throws if required env vars are missing or the CLI fails.
 */
export async function fetchWordPressItems(): Promise<BitwardenItem[]> {
  const clientId = process.env.BW_CLIENTID;
  const clientSecret = process.env.BW_CLIENTSECRET;
  const password = process.env.BW_PASSWORD;
  if (!clientId || !clientSecret || !password) {
    throw new Error("BW_CLIENTID, BW_CLIENTSECRET, and BW_PASSWORD must be set");
  }

  // 1. Login via API key. Sets up the identity — idempotent after first call.
  const login = await runBw(["login", "--apikey"], {
    env: { BW_CLIENTID: clientId, BW_CLIENTSECRET: clientSecret },
  });
  if (login.code !== 0 && !login.stderr.includes("You are already logged in")) {
    throw new Error(`bw login failed (${login.code}): ${login.stderr.slice(0, 300)}`);
  }

  // 2. Unlock the vault — returns a session key on stdout.
  const unlock = await runBw(["unlock", "--passwordenv", "BW_PASSWORD", "--raw"], {
    env: { BW_PASSWORD: password },
  });
  if (unlock.code !== 0) {
    throw new Error(`bw unlock failed (${unlock.code}): ${unlock.stderr.slice(0, 300)}`);
  }
  const session = unlock.stdout.trim();
  if (!session) throw new Error("bw unlock returned no session key");

  try {
    // 3. Refresh the local vault cache.
    await runBw(["sync"], { env: { BW_SESSION: session } });

    // 4. List items whose name matches "WordPress" (case-insensitive search).
    const list = await runBw(["list", "items", "--search", "WordPress"], {
      env: { BW_SESSION: session },
    });
    if (list.code !== 0) {
      throw new Error(`bw list items failed (${list.code}): ${list.stderr.slice(0, 300)}`);
    }

    const items = JSON.parse(list.stdout) as BitwardenItem[];
    // Narrow to login items whose name actually begins with "WordPress"
    return items.filter(
      (i) => i.type === 1 && /^wordpress/i.test(i.name.trim())
    );
  } finally {
    // 5. Logout to clear any leftover session state in /tmp.
    await runBw(["logout"], {}).catch(() => {});
  }
}

/**
 * Extract the client name from a Bitwarden item name like "WordPress - CAMCO"
 * or "Wordpress - Bob's Custom Roofing". Returns null if the pattern doesn't match.
 */
export function extractClientNameFromItem(itemName: string): string | null {
  const match = itemName.trim().match(/^wordpress\s*[-–—]\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Normalize a business name for matching. Lowercase, strip punctuation/whitespace.
 * "Bob's Custom Roofing" → "bobscustomroofing"
 */
export function normalizeBusinessName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Dashboard `businessName` → extra Bitwarden item suffixes to match.
 * The suffix is the part after `Wordpress - ` in the vault item name.
 * Add entries here when the dashboard name and vault name drift apart.
 */
const CLIENT_BITWARDEN_ALIASES: Record<string, string[]> = {
  "Easy Breezy": ["Eazy Breezy Heating & Cooling"],
  "Nelson Greer Painting": ["Greer Painting"],
  "Joe's Yard and Tree": ["Joe's Yard Tree & Irrigation"],
};

/**
 * Return every normalized key that should match a given client — the primary
 * name plus any aliases from CLIENT_BITWARDEN_ALIASES.
 */
export function matchKeysForClient(businessName: string): string[] {
  const keys = [normalizeBusinessName(businessName)];
  const aliases = CLIENT_BITWARDEN_ALIASES[businessName];
  if (aliases) {
    for (const a of aliases) keys.push(normalizeBusinessName(a));
  }
  return keys;
}
