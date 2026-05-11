# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## monthly-blogs — agent context

A Next.js 14 (App Router) + Vercel app that researches, writes, and publishes monthly blog posts for 26 client WordPress sites managed by CS Design Studios. Package manager is **pnpm**.

## Who you're working with
The user is an SEO, not a developer. Default to plain English and explain any technical term on first use. When giving instructions, split clearly into "what I'm doing" vs "what you need to do."

## Commands

- `pnpm dev` — run the Next.js dev server (dashboard lives at `/admin/blog-agent`, gated by `DASHBOARD_PASSWORD`).
- `pnpm build` — production build (this is what Vercel runs on push to `main`).
- `pnpm lint` — `next lint`.
- `pnpm start` — start the built production server.
- No test runner is configured — there's no `pnpm test`. Don't invent test commands.
- Typecheck: `npx tsc --noEmit`. Pre-existing errors exist (see Conventions); the Vercel build still passes.

## Pipeline (end-to-end)

1. **Researcher** — [lib/blog-agent/researcher.ts](lib/blog-agent/researcher.ts). For each client, suggests blog topics that support the client's commercial pages. Uses Serper (live SERPs), AlsoAsked (PAA), you.com Contents (#1 ranking page markdown), and SEMrush (real volume / KD / CPC). Drops zero-volume topics. Produces `TopicSuggestion` rows.

2. **Writer** — [lib/blog-agent/writer.ts](lib/blog-agent/writer.ts). For each approved topic, generates a full HTML post. Uses Serper + you.com Contents to read the top 3 currently-ranking pages and outperform them. Auto-attaches a Freepik featured image. Strips em dashes / smart quotes / "delve" / "tapestry" / corporate buzzwords after generation (`sanitizeAiArtifacts`), then warns about anything that survived (`aiTellsDetected` field on the post). Builds a real "internal link pool" per post (service pages from homepage nav + recent posts from client's WP REST API) and forces the model to use ONLY URLs from that pool — never invent.

3. **Publisher** — [lib/blog-agent/publisher.ts](lib/blog-agent/publisher.ts). Pushes the post to the client's WordPress site. Two paths:
   - Native WP REST + app password (default).
   - **CS Publisher** custom mu-plugin ([wp-plugin/cs-publisher.php](wp-plugin/cs-publisher.php)) — used when Wordfence or other plugins block app passwords. Has its own `/wp-json/cs-publisher/v1/publish` endpoint with shared-secret auth, plus `?rest_route=` and www/non-www fallbacks for broken setups.

Tags are deliberately not generated or published — clients don't want auto-tags.

## Dashboard ([app/admin/blog-agent/](app/admin/blog-agent/))

- **Dashboard tab** — overview, progress banner, empty-state client cards
- **Clients tab** — 26 client cards, WP test-connection, batch test-all, per-client CS Publisher installer download, Bitwarden creds sync
- **Topics tab** — per-client topic queue, approve / reject, "select-and-write" cherry-pick
- **Posts tab** — drafts/ready/published, Preview/HTML toggle, per-post Publish / Retry / Rewrite / Delete buttons
- **Schedule tab** — research / write / publish day-of-month config
- **Settings tab** — global SEO rules + content instructions (KV-backed, **additive** on top of hardcoded core rules in writer.ts), word count, separate model picker for researcher vs writer

## External services + env vars

All env vars live in **Vercel's UI**, not local `.env`. Local clones lag behind `origin/main` often — always `git fetch` before answering "is X in the code?"

- `OPENROUTER_API_KEY` — LLM gateway (routes to Anthropic Sonnet by default)
- `ANTHROPIC_API_KEY` — direct Anthropic if needed
- `SERPER_API_KEY` — Google SERPs (used by both researcher and writer)
- `ALSOASKED_API_KEY` — PAA expansion (**researcher only**)
- `YOUCOM_API_KEY` — competitor markdown (**both** researcher and writer)
- `SEMRUSH_API_KEY` — keyword metrics. **Researcher only by design** — keeps the writer prompt lean. Quality gains in the writer come from real competitor content (you.com), not keyword numbers. Standard quota 50k units/month, ~10% used at 26 clients.
- `FREEPIK_API_KEY` — featured images
- `DASHBOARD_PASSWORD` — gates `/admin` behind login

## Storage

Vercel KV (Upstash Redis under the hood). [lib/blog-agent/store.ts](lib/blog-agent/store.ts) splits state into per-data-type keys (clients / topics / posts / runs / schedule / globalSettings) — was a single blob before, broke under load. `/api/blog-agent/health` diagnoses KV.

## Deploy

GitHub repo `bhavleen-seo/monthly-blogs` → Vercel auto-deploy on push to `main`. **There is no staging.** Treat every push to main as a production deploy. Never push speculative or half-finished work.

## Client SEO plugin mix

Most of the 26 client WP sites run **RankMath**; a minority run **Yoast**. The publisher dual-sends both sets of meta keys (`rank_math_title` / `rank_math_description` / `rank_math_focus_keyword` AND the `_yoast_wpseo_*` equivalents). Whichever plugin is installed picks up its own keys; the other set is ignored. Don't try per-client plugin detection.

## WP credentials sync

Live in Bitwarden vault, dispatched via GitHub Action → `/api/blog-agent/receive-credentials` ingests them into KV. The old approach using `@bitwarden/cli` broke the Vercel build (build env can't run the CLI), so anything credential-related routes through the GitHub Action.

## Conventions

- **Hardcoded core rules in writer.ts always apply.** KV-stored SEO rules / content instructions are additive on top — even if KV is empty, posts are still safe.
- **All external integrations no-op gracefully.** If an API key is missing or a request fails, the integration returns `[]` or `null`. Callers must never throw.
- **`inferRegion` lives in [lib/blog-agent/serper.ts](lib/blog-agent/serper.ts).** Multiple modules need region inference for geo-targeted calls — keep it there.
- **TypeScript has pre-existing errors** in `clients-tab.tsx`, `settings-tab.tsx`, `scheduler.ts`, `site-context.ts`. They're not from recent work; `tsc --noEmit` will flag them but the Vercel build passes.

## How to come up to speed on recent work

`git log --oneline -50` — commit messages are written for context, not just titles. `git show <hash>` for any specific change. Local clone is often stale; `git fetch --all` first.
