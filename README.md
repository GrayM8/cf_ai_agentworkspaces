# AgentWorkspaces

Real-time collaborative rooms powered by Cloudflare's edge infrastructure. Each room features multi-user chat, a shared AI assistant (Workers AI / Llama 3.3 70B), pinned memories, todos with completion tracking, and rich artifacts — all synchronized in real time via WebSocket connections to Durable Objects.

**Live demo:** [agentworkspaces.pages.dev](https://agentworkspaces.pages.dev)

## Try It Out

1. Open the live link above
2. Enter a room name (or use the randomly generated one) and click **Launch Room**
3. Open the same room in a second browser tab to see real-time sync
4. Try these features:
   - **Chat** — send messages, see them appear instantly across tabs
   - **AI assistant** — type `@ai <question>` to talk to the AI, or `/summarize` for a discussion summary
   - **AI tools** — ask the AI to manage room state: `@ai remember that the deadline is Friday`, `@ai add a todo to review the PR`, `@ai mark the first todo as done`
   - **Slash commands** — type `/` in the composer to see all available commands (`/remember`, `/todo`, `/memory`, `/export`, `/reset`)
   - **Pinned memories** — add, delete, and view shared memories in the right panel
   - **Todos** — add, complete (checkbox), and delete todos — completion state syncs to all clients and is visible to the AI
   - **Artifacts** — create documents (AI-generated or manual), view with Markdown rendering, copy, and delete
   - **Room settings** — customize the AI system prompt and toggle auto-respond mode (Room tab in the right panel)

## Architecture

```
┌─────────────────┐   WebSocket    ┌──────────────────────────────────────┐
│  web/           │ <───────────>  │  worker/                             │
│  React 19 SPA   │                │  Cloudflare Worker                   │
│  Tailwind CSS 4 │                │  ├─ Durable Objects (1 per room)     │
│  on CF Pages    │                │  │  ├─ WebSocket Hibernation API     │
│                 │                │  │  ├─ Chat history persistence      │
│                 │                │  │  ├─ Pinned memory & todos         │
│                 │                │  │  ├─ Artifacts storage             │
│                 │                │  │  └─ Room settings                 │
│                 │                │  └─ Workers AI (Llama 3.3 70B)       │
│                 │                │     └─ Tool calling (9 tools)        │
└─────────────────┘                └──────────────────────────────────────┘
```

### Cloudflare Products Used

- **Workers** — HTTP routing, WebSocket upgrade handling
- **Durable Objects** — per-room state (chat history, memories, todos, artifacts, settings) with the WebSocket Hibernation API for scalable persistent connections
- **Workers AI** — LLM inference (Llama 3.3 70B) with function/tool calling for room state management
- **Pages** — static frontend hosting

### Key Design Decisions

- **WebSocket Hibernation API**: Durable Objects can be evicted from memory between messages to reduce costs. All room state is lazily loaded from storage on first access after hibernation via `ensureLoaded()`, and writes are batched/debounced to minimize storage operations.
- **AI tool calling**: The AI can manage room state directly (add/delete memories, create/toggle/delete todos, create/delete artifacts) through a single-round tool execution loop — tools are offered on the first call, executed, then a second call without tools forces a natural language confirmation.
- **Optimistic broadcasts**: State changes (memory updates, artifact creation, etc.) are broadcast to all connected clients immediately, with storage writes happening asynchronously via debounced flush timers.

## Local Development

### Prerequisites

- Node.js 18+
- A Cloudflare account (free plan works) with `wrangler login` completed

### Setup

```bash
git clone <repo-url>
cd cf_ai_agentworkspaces
npm install          # installs all workspace dependencies
```

### Run locally

```bash
npm run dev          # starts both worker (:8787) and web (:5173) concurrently
```

Or run them separately:

```bash
npm run dev:worker   # worker only — wrangler dev on :8787
npm run dev:web      # web only — vite on :5173
```

The frontend defaults to `http://localhost:8787` for the worker URL in development.

### Deployment

**Worker:**

```bash
npm run deploy:worker   # runs wrangler deploy
```

**Frontend:**

```bash
cd web
VITE_WORKER_URL=https://edgerooms-worker.<your-subdomain>.workers.dev npm run build
npx wrangler pages deploy dist --project-name=agentworkspaces
```

## Project Structure

```
├── worker/
│   └── src/
│       ├── index.ts        # Worker entry — routing, CORS, WebSocket upgrade
│       └── room.ts         # Durable Object — all room logic, AI, tool calling
├── web/
│   └── src/
│       ├── Splash.tsx       # Home / room creation page
│       ├── RoomView.tsx     # Main room layout
│       ├── ChatPanel.tsx    # Chat messages, composer, slash/mention autocomplete
│       ├── SidePanel.tsx    # Tabbed panel (Memory, Artifacts, Room)
│       ├── MemoryTab.tsx    # Pinned memories & todos with CRUD controls
│       ├── ArtifactsTab.tsx # Artifact list, creation, detail view
│       ├── RoomTab.tsx      # Room info, AI settings, system prompt editor
│       ├── ExportModal.tsx  # JSON export viewer
│       ├── Header.tsx       # Room header with nav, user identity, actions
│       ├── useRoom.ts       # WebSocket connection hook — all client-server communication
│       └── types.ts         # Shared TypeScript interfaces
└── package.json             # Workspace root
```

## AI Tool Capabilities

The AI assistant has access to 9 tools for managing room state:

| Tool | Description |
|------|-------------|
| `add_memory` | Pin a new memory to the room |
| `delete_memory` | Remove a memory by index |
| `clear_memories` | Remove all pinned memories |
| `add_todo` | Add a new todo item |
| `delete_todo` | Remove a todo by index |
| `toggle_todo` | Mark a todo complete/incomplete |
| `clear_todos` | Remove all todos |
| `create_artifact` | Create a Markdown document (summary, plan, notes, or custom) |
| `delete_artifact` | Remove an artifact by ID or title |

## Limitations & Tradeoffs

This is a portfolio project built to demonstrate Cloudflare's edge platform, not a production-ready product. Some intentional tradeoffs and known limitations:

- **No authentication** — anyone with a room URL can join, send messages, modify memories/todos, delete artifacts, and change settings. Fine for demos, not for real use.
- **AI tool reliability** — Llama 3.3 70B's tool calling is functional but not bulletproof. It occasionally misidentifies indices, calls the wrong tool, or fails to use tools when it should. A more capable model or retry/validation logic would improve this.
- **Fixed context window** — the AI sees only the last 30 messages via a sliding window. There is no summarization or compaction of older messages, so long conversations lose early context entirely.
- **No rate limiting** — there are no guards against chat spam, rapid AI invocations, or storage abuse. A production version would need per-user and per-room rate limits.
- **Single-region Durable Object** — each room's Durable Object lives in one Cloudflare data center (chosen at creation time). Users far from that region will experience higher WebSocket latency.
- **No message persistence beyond 50** — chat history is capped at 50 entries. Older messages are dropped, not archived.
- **Ephemeral display names** — usernames are stored in `localStorage` and sent with each message, but there's no identity verification. Anyone can impersonate any name.
- **No mobile support** — the UI is designed for desktop viewports. The side panel, chat layout, and composer are not responsive.

---

Thanks for taking the time to review this project! It was genuinely fun to build — getting Durable Objects, Workers AI, and tool calling all working together on the edge was a great experience. I appreciate the consideration for the internship and look forward to hearing from the team.

— Gray Marshall
https://www.graymarshall.dev/
