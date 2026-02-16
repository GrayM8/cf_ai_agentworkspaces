# EdgeRooms — Prompt Log

Prompts and key decisions logged here starting after initial scaffolding.

Prompt 1. 
```aiignore
We are now starting implementation for the EdgeRooms MVP. Implement the smallest end-to-end vertical slice:
- multi-user chat in a single room
- WebSockets
- Durable Object as the room authority
- web UI connects and sends/receives messages

Repo structure:
- worker/ (Cloudflare Worker + Durable Objects)
- web/ (Vite + React)

IMPORTANT: Keep it MVP-simple. No auth. No fancy UI. No Workers AI yet (leave stubs only).
We should be able to run:
- `npm run dev:worker`
- `npm run dev:web`
  and open the web UI to chat with multiple browser tabs in the same room.

## Backend requirements (worker/)
1) Implement WebSocket upgrade endpoint:
- Route: `GET /ws/:roomId`
- It should:
    - validate roomId exists (basic check only)
    - connect the request to the Durable Object instance for that roomId
    - the Durable Object owns the socket and broadcasts messages

2) Durable Object Room implementation (worker/src/room.ts):
- Accept WebSocket connections.
- Maintain in-memory list of connected sockets (and use WebSocket Hibernation pattern if feasible, but don’t overcomplicate).
- Message format (JSON):
    - client -> server: { "type": "chat", "user": string, "text": string, "ts"?: number }
    - server -> clients broadcast: { "type": "chat", "user": string, "text": string, "ts": number }
    - server -> clients presence: { "type": "presence", "count": number }
- On connect/disconnect, broadcast presence.
- On receiving a chat message, validate fields (string, non-empty, length cap), add ts, broadcast to all.
- No persistence required yet (ok to keep just runtime state).

3) Keep `worker/src/index.ts` as the router:
- handle `/` returning “EdgeRooms worker is running.”
- handle `/ws/:roomId` and forward to DO

4) Ensure wrangler.toml bindings are correct for the DO class and routes.
- If any dev-time issues with module format/bindings, fix them.

## Frontend requirements (web/)
1) Update App.tsx to a minimal room UI:
- Inputs:
    - roomId (default: "demo")
    - display name (default random like "User123")
    - message input
- Button: Connect / Disconnect
- Show connection status
- Show presence count
- Message list (append-only)

2) On Connect:
- Open WebSocket to `${WORKER_URL}/ws/${roomId}` (use env/config in Vite)
- On message from server, parse JSON and update UI.
- On send, send JSON chat message.

3) Vite env:
- Use `VITE_WORKER_URL` with default `http://localhost:8787`
- Add a small note in web README comments or root README if needed.

## Output / deliverables
- Make code changes needed to satisfy above.
- Then print:
    - What files you changed
    - How to run locally
    - A quick manual test checklist (two tabs chatting)

Do NOT implement Workers AI or memory features yet. This prompt is only the realtime room chat loop.
```

Prompt 2.
```aiignore
Bugfix: presence count does not decrease for remaining clients when one client disconnects.

Please inspect worker/src/room.ts and fix presence tracking in the Durable Object.

Constraints:
- Keep the existing WebSocket Hibernation approach (acceptWebSocket + webSocketMessage + webSocketClose).
- No feature expansion; only fix presence correctness.
- Presence must update for remaining clients when any client disconnects (tab close OR clicking Disconnect).
- Do not rely on a stale in-memory Set for counting/broadcast if hibernation is enabled; use the authoritative socket list provided by the platform (ctx.getWebSockets() or state.getWebSockets(), whichever is correct for this implementation).
- When broadcasting, only send to sockets that are OPEN; gracefully ignore/skip any closed sockets.

Implementation guidance:
1) Implement helper methods:
- getSockets(): returns current open sockets from ctx/state
- broadcast(obj): JSON.stringify + send to each OPEN socket
- broadcastPresence(): computes count and broadcasts {type:"presence", count}

2) Call broadcastPresence():
- after accepting a new WebSocket
- inside webSocketClose handler
- (optional) after errors / cleanup

3) Verify the webSocketClose signature matches Cloudflare’s expected parameters for Durable Object hibernation callbacks so it actually fires.

After changes:
- Print the exact code path used to compute count
- Provide a short manual test checklist confirming the count decrements when a tab closes.

Only change what you need to fix the bug.
```

Prompt 3.
```aiignore
We have two remaining correctness issues in the EdgeRooms realtime loop:

1) Presence count does NOT decrement for other clients when a user clicks the UI "Disconnect" button.
   - Presence decrements correctly when the user closes the browser tab.
2) After clients join/leave/reconnect (especially after a transient disconnect), we sometimes see:
   - a client being counted multiple times
   - duplicate message delivery (some clients receive a message multiple times)
   - a rejoined client sees its own outgoing messages appear twice

This strongly suggests ghost sockets and/or multiple active WebSocket connections per client/tab.

Your task: INVESTIGATE FIRST, then apply the smallest robust fix. Do not add AI features or memory yet.

## Step 1 — Add targeted diagnostics (minimal)
Backend (worker/src/room.ts):
- Add structured console logs for:
  - connect accepted (include a generated connectionId)
  - close events (code/reason/wasClean) + which connectionId
  - message received (connectionId)
  - presence broadcast (count + list of connectionIds if feasible)
- Keep logs concise.

Frontend (web/src/App.tsx):
- Log:
  - when Connect is clicked and whether a socket is already open
  - when Disconnect is clicked and whether ws.close() is actually called
  - ws lifecycle events: onopen/onclose/onerror
  - ensure only one WS instance exists per tab at a time

## Step 2 — Reproduce + explain root cause
Run through the known repro pattern (join/leave until one disconnects unexpectedly, then reconnect).
Then output a short "Findings" section answering:
- Is the Disconnect button actually closing the socket?
- Are multiple sockets being created in the same tab?
- Are server-side sockets lingering after client disconnect (no close event)?
- Is any reconnect logic present that could open a second socket without closing the first?

## Step 3 — Implement minimal fixes (robust connection lifecycle)
Make these changes as needed:

Frontend:
- Store the WebSocket instance in a `useRef` so it cannot become stale.
- Disable Connect while ws is OPEN or CONNECTING.
- On Disconnect:
  - call `ws.close(1000, "client disconnect")`
  - immediately set UI state to "disconnecting" and then update state on onclose
- On component unmount:
  - close any existing socket
- Ensure event handlers are not duplicated across reconnects.

Backend:
- Do NOT keep an in-memory Set as the source of truth.
- BUT introduce a lightweight connection identity mechanism:
  - On connect, assign a `connectionId` and attach it to the WebSocket via a symbol property (or Map keyed by ws).
  - Use ctx.getWebSockets() as the socket source, but maintain a Map<websocket, connectionId> for logging/dedup.
- Implement heartbeat to kill ghost sockets (minimal):
  - Client sends {type:"ping"} every ~15s (or similar)
  - Server replies {type:"pong"}
  - Track lastSeen per socket; if no ping in ~45s, server closes the socket.
  - This addresses network-drop sockets that never close cleanly.
- Presence count should be based on sockets that are OPEN AND recently seen (or OPEN + not stale).

## Step 4 — Confirm fixes
Provide an updated manual test checklist, specifically:
- Disconnect button decrements presence for others within 1s
- After forced reconnects / transient drops, no duplicates in message delivery
- No double-sends from the rejoined client

Finally, print:
- Files changed
- Any new constants/timers and why they’re chosen
```

Prompt 4.
```aiignore
We are implementing AI participation + shared room memory in EdgeRooms.

Goal:
- Add Workers AI integration
- Add structured pinned memory in the Durable Object
- Add minimal commands
- Keep changes incremental and clean
- No vector database yet
- No persistence beyond DO state

## Backend changes (worker/)

### 1. Add pinned memory structure to Room DO state
In worker/src/room.ts:

Add:
pinned = {
  goal?: string,
  facts: string[],
  decisions: string[],
  todos: string[]
}

Initialize safely on first use.

### 2. Add command handling in webSocketMessage
When receiving a chat message:

If text starts with:
- "/remember " → append remainder to pinned.facts
- "/decide " → append remainder to pinned.decisions
- "/summarize" → trigger AI summary of recent discussion
- "@ai " → trigger AI response

Commands should:
- update pinned state
- broadcast updated presence OR memory update event
- optionally broadcast a system confirmation message

Do NOT yet persist to storage.

### 3. Integrate Workers AI

In wrangler.toml:
- Add AI binding properly (not commented out).
Use the official Workers AI binding.

In index.ts:
- Ensure Env interface includes AI binding.

In Room:
- Add async method callAI(prompt: string)

Prompt structure:
SYSTEM:
"You are the AI host of a collaborative chat room.
You help summarize, clarify decisions, and answer questions.
Be concise."

Include:
- Pinned memory formatted cleanly
- Last 20 messages formatted as "User: text"

Call model:
@cf/meta/llama-3.3-70b-instruct (or current recommended model if needed)

Return text response only.

### 4. Broadcast AI message
When AI is triggered:
- Append AI message as:
  {
    type: "chat",
    user: "AI",
    text: "...",
    ts: Date.now()
  }
- Broadcast to all clients.

Prevent AI storm:
- Ensure only one AI call runs at a time per room.
- If another AI request happens while one is running, ignore it.

## Frontend (web/)
- No major UI changes required.
- Just ensure AI messages render normally.
- Optionally render AI user differently (light styling only).

## Deliverables
After implementing:
- List files changed
- Provide example manual test sequence:
  - connect two tabs
  - /remember something
  - @ai what did we remember?
  - /summarize
- Confirm Workers AI is being called successfully
- Show sample prompt being sent (sanitized)

Keep code clean and readable.
```

Prompt 5.
```aiignore
Next step: persist room state using Durable Object storage so rooms survive restarts.

Implement durable persistence for:
- pinned memory (facts/decisions/todos/goal)
- message history ring buffer (or at least last MAX_HISTORY messages)
- any metadata needed (e.g., lastAiTs or lastAiIndex if used)

Constraints:
- Keep runtime behavior the same (chat + AI + commands).
- No new Cloudflare services yet (no D1/KV/R2/Vectorize).
- Use Durable Object storage: this.ctx.storage (or this.state.storage depending on current code style).
- Avoid excessive writes: batch/debounce writes where sensible.

Backend tasks (worker/src/room.ts):
1) On Room initialization / first request:
- Load persisted state from storage into memory (pinned + messages + any cursors).
- If missing, initialize defaults.

2) After state mutations:
- When pinned changes (/remember /decide /todo /reset):
  - persist pinned (debounced, e.g. setTimeout or alarm-based flush).
- When messages append:
  - persist messages occasionally (e.g. every 5 messages or every 2 seconds), not on every single message.
  - Keep only last MAX_HISTORY persisted.

3) Add commands:
- "/export" → broadcast a system message with a compact JSON export (or send as a special message type "export" the frontend can show in a textarea)
- "/reset" → clears pinned + messages AND persists the cleared state
- "/reset" should be room-owner only for now:
  - define owner as the first client that ever connected after creation; store ownerId in durable storage.
  - clientId can be a random UUID generated in the frontend and sent in hello handshake (see below).

Frontend tasks (web/src/App.tsx):
1) Add a stable clientId:
- On first load, generate UUID and store in localStorage.
- On WebSocket connect, send a hello message:
  { "type": "hello", "clientId": "...", "user": "DisplayName" }
- Server uses this to set room owner on first hello if owner not set.
2) If server sends an "export" message, display it nicely (modal or textarea) but keep UI minimal.

Protocol updates:
- Add message types:
  - hello
  - export (optional)
- Keep chat messages unchanged.

Deliverables:
- List files changed
- Explain persistence strategy and debounce thresholds
- Provide manual test steps:
  - connect, /remember, refresh tab, /memory still shows data
  - open new tab, data still present
  - /export shows JSON
  - non-owner cannot /reset (gets system message)
  - owner can /reset and it persists
```

Prompt 6.
```aiignore
We are overhauling the frontend into Option B (“Notion-lite collaboration room”) and shipping Artifacts as a real feature. You may add backend protocol/features as needed.

Constraints:
- Use TailwindCSS in web/ (dark neutral style).
- Keep the system simple, but product-like.
- Preserve existing realtime chat, AI, memory, persistence, ownership.
- It must work locally with `npm run dev` and remain deployable later.
- Prefer typed message types over slash-commands for UI actions, but keep slash commands working for power users if easy.

## UX/Layout (web/)
Implement a 2-column room UI with a fixed header:
Header:
- Room title (use roomId for now; optional editable later)
- Presence pill (count)
- Connection status text (Connected/Reconnecting/Disconnected)
- Buttons: Copy Invite Link, Export, Reset (Reset visible only if isOwner)

Main:
Left column: Chat timeline + composer
- Group consecutive messages by same sender within 2 minutes.
- AI messages show “AI” badge and subtle tinted background.
- System messages appear as subtle separators.
Composer:
- input (Enter send, Shift+Enter newline)
- action buttons: Ask AI (prefill @ai), Summarize, Create Artifact

Right column: Tab panel with tabs: Memory | Artifacts | Room
Memory tab:
- Render pinned memory as structured sections (Goal/Decisions/Facts/Todos).
- Add buttons: Add Fact, Add Decision, Add Todo (open small inline input; submit sends event).
- Memory updates should NOT clutter chat; update the panel via a server `memory_update` event.

Artifacts tab:
- List of artifacts (title, type, createdAt, createdBy).
- Button: New Artifact opens modal:
  - choose type (Summary/Plan/Notes/Custom)
  - title (optional)
  - mode: Generate with AI (default) or Manual
  - if AI: generate from last 20 messages + pinned memory
  - if Manual: textarea content
- On create: show in list and open detail view.
- Detail view: show content in readable format, copy button.
- Delete button (only owner for now) with confirm.

Room tab:
- Show roomId, invite link, owner status, model info (Workers AI), and small debug info.

Tailwind:
- Add Tailwind properly (postcss, config, etc).
- Use a dark neutral palette (zinc/neutral) with minimal accent.

## Backend changes (worker/)
Add first-class state/events for Memory and Artifacts.

Memory:
- On hello/join, send `memory_update` with the full pinned memory object.
- When memory changes (via UI event or slash commands), persist and broadcast `memory_update`.

Artifacts:
- Add persisted artifacts array in DO storage.
- On hello/join, send `artifact_list` (light list) and allow `artifact.get` if you keep content separate (your choice).
- Implement messages:
  - client -> server:
    - {type:"memory.add", kind:"facts"|"decisions"|"todos", text:string}
    - {type:"memory.setGoal", text:string}
    - {type:"artifact.create", mode:"ai"|"manual", artifactType, title?, content? }
    - {type:"artifact.delete", id}
    - {type:"artifact.list"}
  - server -> clients:
    - {type:"memory_update", pinned}
    - {type:"artifact_list", items:[{id,type,title,createdAt,createdBy}]}
    - {type:"artifact_created", artifact}
    - {type:"artifact_deleted", id}
- Owner-only enforcement:
  - Reset and artifact.delete should be owner-only for now.

AI artifact generation:
- Reuse Workers AI call.
- For mode="ai": build prompt using pinned memory + last 20 messages.
- Return content only; generate title if missing (LLM can suggest).
- Guard: if aiRunning true, reject with system message “AI is busy”.

Keep existing slash commands working:
- /remember -> memory.add facts
- /decide -> memory.add decisions
- /todo -> memory.add todos
- /summarize -> create artifact type=summary with AI OR just AI chat message (pick one, but be consistent)
- /export and /reset keep working

## Deliverables
- Files changed list
- How to run locally
- Manual test checklist covering:
  - memory panel updates across two tabs without chat spam
  - create AI artifact and see it in both tabs
  - create manual artifact
  - export works
  - reset owner-only
  - chat still works and AI @ai still works
```

Prompt 7.
```aiignore
Fix layout so the right SidePanel does NOT scroll away with chat. Only the chat message list should scrolls, not the whole page. Additionally, 
add markdown rendering for AI outputs and artifact content using @tailwindcss/typography and `react-markdown` + `remark-gfm` as necessary. Do   
NOT enable raw HTML.
```

Prompt 8.
```aiignore
Create a popup from the chat interface that appears when / is typed, displaying all of the defined / commands and their functionality.
```

Prompt 9.
```aiignore
  Redesign the home/splash page (web/src/Splash.tsx) of my Cloudflare Workers collaboration app. The current page is a flat stack of inputs centered
   on a dark void with no visual character. Keep all existing functionality intact (display name input, create room button, join room with ID       
  input). The project uses Tailwind CSS v4, React 19, and has no animation libraries.                                                               
   
  Design direction: Refined, atmospheric dark interface with subtle depth — not brutalist, not generic SaaS. Think sophisticated command console.   
                                                                               
  Specific requirements:

  1. Typography: Add a Google Fonts stylesheet to index.html. Set up three font families as CSS custom properties in index.css: a serif display font
   for the title (something unexpected for a tech tool that creates contrast), a clean geometric sans-serif for body/UI text, and a monospace font
  for code-like values (room IDs). Apply the body font globally with antialiasing.
  2. Background atmosphere: Add layered background effects behind the content — subtle colored radial blurs (emerald and sky tones to match the
  app's existing accent colors) plus a faint dot-grid texture overlay. All pointer-events-none.
  3. Layout: Group the inputs and buttons inside a single card container with a frosted glass effect (border, backdrop-blur, subtle shadow), rather
  than having them float freely. Keep the hero (icon + title + subtitle) above the card. Add small feature badges below the card as a footer.
  4. Animations: Define CSS keyframe animations in index.css (no JS animation libraries) for a staggered entrance effect — the hero, card, and
  footer should rise/fade in sequentially with ~100ms delays between them. Also add a soft pulsing animation for a small status dot.
  5. Polish details:
    - Small branded icon mark (sparkle/star SVG) above the title in an emerald-tinted container with a ring
    - Title rendered in the serif display font at text-5xl
    - Create button in emerald-600 with hover shadow glow and active:scale press effect
    - Room ID input styled in the monospace font
    - Inputs use border-based styling with focus transitions (border lightens, background deepens)
    - Divider text as uppercase tracking-widest "or join"
    - Footer hints with inline SVG icons for "AI-powered" (with breathing dot), "End-to-end on Cloudflare" (shield), and "Real-time collaboration"
  (users)
  6. Global CSS changes: Add the font stack custom properties, body font-family declaration, and the keyframe animations to index.css while keeping
  the existing scrollbar styles untouched.
```

Prompt 10.
```aiignore
Redesign all room page components (Header, ChatPanel, SidePanel, MemoryTab, ArtifactsTab, RoomTab, ExportModal, RoomView) to match the aesthetic  
  established in the Splash page redesign. Preserve all existing functionality. Use the CSS variable font stack (--font-display, --font-body,       
  --font-mono) throughout. Apply these patterns consistently:                                                                                       
   
  - Inputs: border border-zinc-800 bg-zinc-950/60 focus:border-zinc-600 instead of ring- and solid bg-zinc-800                                      
  - Primary actions: Emerald-600 buttons with hover/active states (replacing zinc-700)
  - Header: Add the sparkle icon + serif title from Splash, room ID in a bordered mono pill, backdrop-blur bar, "Copied!" feedback on invite
  - Chat messages: User initial avatars, sparkle icon for AI, system messages as divider lines, timestamps in mono HH:MM format, empty state with
  icon and / hint, emerald send button
  - Slash command popup: Add "Commands" header, bordered mono badges for command names, rounded-lg container with shadow
  - Side panel tabs: Add SVG icons per tab, emerald accent on active tab instead of zinc-400 underline
  - Memory/Artifacts tabs: Dashed-border empty states, bordered card-style list items, emerald "+ Add"/Save/Create buttons, emerald ring on active
  type selectors
  - Export modal: Backdrop-blur overlay, rounded-xl card, mono textarea, emerald copy button
  - Connection states: Emerald spinner for connecting, X icon for failed, emerald retry button

  Use backdrop-blur-sm and /60 border opacity throughout for atmospheric depth. Quick actions as bordered chips with transition hovers. All metadata
   timestamps and IDs in var(--font-mono).
```

Prompt 11.
```aiignore
Bug: AI context + /summarize behave as if they cannot see chat before the last AI reply.
Example: Ask a question, AI answers, then immediately run /summarize → it says there is no recent discussion.

This is likely caused by context selection using a “since last AI” cursor (lastAiTs/lastAiIndex/lastSummarizedIndex), resulting in empty context.

Task:
1) Inspect worker/src/room.ts for any logic that filters messages “since last AI reply” or “since last summarize”.
2) Change prompt/context selection so that BOTH:
   - @ai <question>
   - /summarize
   always include the last N chat messages (e.g. last 30–50) regardless of last AI call.

Rules:
- Use the authoritative chat history buffer (the same one you append to for normal chat).
- Include both user + AI chat messages in context.
- Exclude system messages from the context window (optional) unless helpful.
- /summarize should summarize the last N messages even if no new messages occurred since last AI response.

3) Add minimal diagnostics:
- When building an AI prompt, log:
  - total chat messages in history
  - selected messages count
  - timestamps range
  - whether any cursor was applied

Deliverable:
- Explain what caused the bug (which cursor/filter).
- Confirm with manual test:
  - send 3 messages, @ai responds
  - run /summarize, should summarize those messages (not say “no discussion”)
```

Prompt 12.
```aiignore
Task: Add memory/todo management controls and fix artifact deletion bug.                                                                          
                                                                               
  1. Delete memories & todos                                                                                                                        
  Add a trash icon to the right of each pinned memory and todo item. Clicking it removes the item for all connected clients via a new memory.remove 
  WebSocket message.

  2. Todo completion
  - Replace the decorative checkbox with a functional one that toggles done/not-done state via memory.toggle.
  - Completed todos should appear struck through and dimmed.
  - Update the todo data structure from string[] to { text: string; done: boolean }[], with backward-compatible migration for existing data.
  - Update formatPinnedMemory() so the AI sees [x]/[ ] status.

  3. Fix artifact deletion
  Deleting an artifact doesn't remove it from the frontend list. The artifact_deleted handler in useRoom.ts references artifactDetail from a stale
  closure — use a functional updater instead.
```

Prompt 13.
```aiignore
Add an @ mention autocomplete popup to the chat composer, mirroring the existing / slash command popup pattern (same keyboard navigation,         
  positioning, and structure). Start with @ai as the only entry. Use sky-blue accent styling to differentiate it from the slash command popup.
```

Prompt 14.
```aiignore
Add room settings to the Room tab: (1) an editable system prompt textarea that syncs across clients, and (2) a toggle for AI response mode —      
  "respond to all messages" vs "only when mentioned with @ai" (default: mention-only). Persist settings in durable storage, broadcast changes to all
   clients, and reset them on /reset.  
```