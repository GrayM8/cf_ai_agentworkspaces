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

