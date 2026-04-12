# Monthly Blogs Agent

AI-powered blog agent for **CS Design Studios** — automatically researches, writes, and publishes monthly blog posts for 26+ client WordPress websites.

## How It Works

```
Day 1  → Agent researches trending topics for each client's industry
Day 1-10 → You review & approve/reject topics in the dashboard
Day 10 → Agent writes full SEO-optimized blog posts for approved topics
Day 10-15 → You review posts (optional)
Day 15 → Agent publishes posts to client WordPress sites
```

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Edit `.env` and add your **Anthropic API key**:
```
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 3. Run the dashboard

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll land on the admin dashboard.

### 4. Load clients

Go to the **Clients** tab and click **"Load All 26 Clients"** to pre-populate with CS Design Studios clients. Then add WordPress credentials for each client.

### 5. WordPress Setup (per client)

Each client's WordPress site needs an **Application Password**:

1. Log into the client's WordPress admin
2. Go to **Users → Profile**
3. Scroll to **Application Passwords**
4. Enter a name (e.g., "Blog Agent") and click **Add New**
5. Copy the password and add it to the client's config in the dashboard

## Features

- **Topic Research** — AI generates SEO-optimized topic suggestions based on each client's industry, audience, and location
- **Topic Approval** — Review, approve, or reject topics before any content is written
- **Blog Writing** — AI writes 1200-1800 word blog posts with proper HTML, meta descriptions, excerpts, and tags
- **WordPress Publishing** — Publishes directly to each client's WordPress site via REST API
- **Scheduling** — Configurable monthly automation (research → write → publish)
- **Multi-Client** — Manages 26+ clients with individual settings (tone, keywords, categories)

## Tech Stack

- **Next.js 14** — App router, API routes, React dashboard
- **Claude AI** (Anthropic) — Content research and writing
- **WordPress REST API** — Direct publishing to client sites
- **TypeScript** — Full type safety
- **Tailwind CSS** — Dashboard styling

## Project Structure

```
├── app/
│   ├── admin/blog-agent/    # Dashboard UI
│   ├── api/blog-agent/      # API routes
│   │   ├── clients/         # Client CRUD
│   │   ├── topics/          # Topic research & approval
│   │   ├── posts/           # Post writing & publishing
│   │   ├── schedule/        # Schedule config
│   │   ├── seed/            # Pre-load 26 clients
│   │   └── test-connection/ # Test WordPress connections
│   └── layout.tsx
├── lib/blog-agent/
│   ├── agent.ts             # Main orchestrator
│   ├── researcher.ts        # Topic research via Claude
│   ├── writer.ts            # Blog writing via Claude
│   ├── publisher.ts         # WordPress REST API publishing
│   ├── scheduler.ts         # Cron-based automation
│   ├── store.ts             # JSON file storage
│   ├── seed-clients.ts      # Pre-configured client list
│   └── types.ts             # TypeScript types
└── data/                    # Runtime data storage
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/blog-agent/clients` | List all clients |
| POST | `/api/blog-agent/clients` | Add a client |
| PUT | `/api/blog-agent/clients` | Update a client |
| DELETE | `/api/blog-agent/clients?id=xxx` | Delete a client |
| GET | `/api/blog-agent/topics` | List topics (filter by clientId, status, month) |
| POST | `/api/blog-agent/topics` | Run topic research |
| POST | `/api/blog-agent/topics/approve` | Approve/reject a topic |
| PUT | `/api/blog-agent/topics/approve` | Bulk approve/reject |
| GET | `/api/blog-agent/posts` | List posts |
| POST | `/api/blog-agent/posts` | Write posts for approved topics |
| POST | `/api/blog-agent/posts/publish` | Publish ready posts |
| POST | `/api/blog-agent/seed` | Load pre-configured clients |
| POST | `/api/blog-agent/test-connection` | Test WordPress connection |
| GET | `/api/blog-agent/schedule` | Get schedule config |
| PUT | `/api/blog-agent/schedule` | Update schedule config |
