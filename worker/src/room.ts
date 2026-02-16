import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_TIMEOUT_MS = 45_000;
const MAX_HISTORY = 50;
const AI_CONTEXT_MESSAGES = 30;
const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const HISTORY_FLUSH_INTERVAL = 5;
const PINNED_FLUSH_DELAY_MS = 1000;

let nextConnId = 1;

interface ChatEntry {
  user: string;
  text: string;
  ts: number;
}

interface PinnedMemory {
  memories: string[];
  todos: string[];
}

interface Artifact {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: number;
  createdBy: string;
}

const SK_PINNED = "pinned";
const SK_HISTORY = "history";
const SK_OWNER = "ownerId";
const SK_ARTIFACTS = "artifacts";

export class Room extends DurableObject<Env> {
  private connIds = new Map<WebSocket, string>();
  private clientIds = new Map<WebSocket, string>();
  private userNames = new Map<WebSocket, string>();
  private lastSeen = new Map<WebSocket, number>();
  private heartbeatAlarm = false;
  private history: ChatEntry[] = [];
  private pinned: PinnedMemory = { memories: [], todos: [] };
  private artifacts: Artifact[] = [];
  private ownerId: string | null = null;
  private aiRunning = false;

  private loaded = false;
  private historyDirty = 0;
  private pinnedFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    const map = await this.ctx.storage.get([SK_PINNED, SK_HISTORY, SK_OWNER, SK_ARTIFACTS]);
    if (map.has(SK_PINNED)) this.pinned = map.get(SK_PINNED) as PinnedMemory;
    if (map.has(SK_HISTORY)) this.history = map.get(SK_HISTORY) as ChatEntry[];
    if (map.has(SK_OWNER)) this.ownerId = map.get(SK_OWNER) as string;
    if (map.has(SK_ARTIFACTS)) this.artifacts = map.get(SK_ARTIFACTS) as Artifact[];
    console.log(`[room] loaded: memories=${this.pinned.memories.length} history=${this.history.length} artifacts=${this.artifacts.length} owner=${this.ownerId ?? "none"}`);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }
    await this.ensureLoaded();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connId = `c${nextConnId++}`;
    this.ctx.acceptWebSocket(server);
    this.connIds.set(server, connId);
    this.lastSeen.set(server, Date.now());
    console.log(`[room] connect ${connId} | total=${this.getOpenSockets().length}`);
    await this.ensureHeartbeatAlarm();
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    this.lastSeen.set(ws, Date.now());
    const type = msg.type as string;

    if (type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    // Always reload state after hibernation (all fields reset to defaults)
    await this.ensureLoaded();

    if (type === "hello") {
      const clientId = typeof msg.clientId === "string" ? msg.clientId : null;
      const userName = typeof msg.user === "string" ? msg.user : "Anonymous";
      if (clientId) {
        this.clientIds.set(ws, clientId);
        this.userNames.set(ws, userName);
        if (!this.ownerId) {
          this.ownerId = clientId;
          await this.ctx.storage.put(SK_OWNER, this.ownerId);
          console.log(`[room] owner set to ${clientId}`);
        }
      }
      // Send initial state to joining client
      for (const entry of this.history) {
        ws.send(JSON.stringify({ type: "chat", ...entry }));
      }
      ws.send(JSON.stringify({ type: "memory_update", pinned: this.pinned }));
      ws.send(JSON.stringify({
        type: "artifact_list",
        items: this.artifacts.map(({ id, type, title, createdAt, createdBy }) => ({ id, type, title, createdAt, createdBy })),
      }));
      ws.send(JSON.stringify({ type: "room_info", ownerId: this.ownerId, clientId }));
      return;
    }

    // --- Memory actions ---
    if (type === "memory.add") {
      const kind = msg.kind as string;
      const text = (msg.text as string || "").trim();
      if (!text || !["memories", "todos"].includes(kind)) return;
      (this.pinned[kind as "memories" | "todos"]).push(text);
      this.schedulePinnedFlush();
      this.broadcastMemoryUpdate();
      return;
    }


    // --- Artifact actions ---
    if (type === "artifact.create") {
      const mode = msg.mode as string;
      const artifactType = (msg.artifactType as string) || "notes";
      const title = (msg.title as string) || "";
      const content = (msg.content as string) || "";
      const userName = this.userNames.get(ws) || "Unknown";

      if (mode === "ai") {
        if (this.aiRunning) {
          ws.send(JSON.stringify({ type: "chat", user: "System", text: "AI is busy, try again shortly.", ts: Date.now() }));
          return;
        }
        this.aiRunning = true;
        this.broadcastSystem("AI is generating artifact...");
        const prompt = this.buildArtifactPrompt(artifactType, title);
        this.callAI(prompt)
          .then((aiContent) => {
            const aiTitle = title || this.inferTitle(artifactType);
            this.addArtifact(aiTitle, artifactType, aiContent, userName);
          })
          .catch((err) => {
            console.log(`[room] AI artifact error: ${err}`);
            this.broadcastSystem(`AI error: ${String(err)}`);
          })
          .finally(() => { this.aiRunning = false; });
      } else {
        this.addArtifact(title || "Untitled", artifactType, content, userName);
      }
      return;
    }

    if (type === "artifact.delete") {
      const id = msg.id as string;
      const clientId = this.clientIds.get(ws);
      if (!clientId || clientId !== this.ownerId) {
        ws.send(JSON.stringify({ type: "chat", user: "System", text: "Only the room owner can delete artifacts.", ts: Date.now() }));
        return;
      }
      this.artifacts = this.artifacts.filter((a) => a.id !== id);
      this.ctx.storage.put(SK_ARTIFACTS, this.artifacts);
      this.broadcast({ type: "artifact_deleted", id });
      return;
    }

    if (type === "artifact.get") {
      const id = msg.id as string;
      const a = this.artifacts.find((x) => x.id === id);
      if (a) ws.send(JSON.stringify({ type: "artifact_detail", artifact: a }));
      return;
    }

    if (type === "artifact.list") {
      ws.send(JSON.stringify({
        type: "artifact_list",
        items: this.artifacts.map(({ id, type, title, createdAt, createdBy }) => ({ id, type, title, createdAt, createdBy })),
      }));
      return;
    }

    // --- Chat ---
    if (type !== "chat") return;
    if (typeof msg.user !== "string" || (msg.user as string).length === 0 || (msg.user as string).length > 64) return;
    if (typeof msg.text !== "string" || (msg.text as string).length === 0 || (msg.text as string).length > 2000) return;

    const text = (msg.text as string).trim();
    const user = msg.user as string;
    this.broadcastChat(user, text);

    // Slash commands (backwards compat)
    if (text.startsWith("/remember ")) {
      const mem = text.slice("/remember ".length).trim();
      if (mem) { this.pinned.memories.push(mem); this.schedulePinnedFlush(); this.broadcastMemoryUpdate(); }
    } else if (text.startsWith("/todo ")) {
      const t = text.slice("/todo ".length).trim();
      if (t) { this.pinned.todos.push(t); this.schedulePinnedFlush(); this.broadcastMemoryUpdate(); }
    } else if (text === "/memory") {
      this.broadcastSystem(this.formatPinnedMemory() || "No pinned memory yet.");
    } else if (text === "/export") {
      const data = { pinned: this.pinned, history: this.history, artifacts: this.artifacts, ownerId: this.ownerId };
      this.broadcast({ type: "export", data });
    } else if (text === "/reset") {
      this.pinned = { memories: [], todos: [] };
      this.history = [];
      this.artifacts = [];
      await this.ctx.storage.put({ [SK_PINNED]: this.pinned, [SK_HISTORY]: this.history, [SK_ARTIFACTS]: this.artifacts });
      this.broadcastMemoryUpdate();
      this.broadcast({ type: "artifact_list", items: [] });
      this.broadcast({ type: "clear_chat" });
      this.broadcastSystem("Room has been reset by " + (user || "someone") + ".");
    } else if (text === "/summarize") {
      this.triggerAI("Summarize the recent discussion concisely. Highlight key points and open questions.");
    } else if (text.startsWith("@ai ")) {
      const q = text.slice("@ai ".length).trim();
      if (q) this.triggerAI(q);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const connId = this.connIds.get(ws) ?? "?";
    console.log(`[room] close ${connId} code=${code} reason=${reason} wasClean=${wasClean}`);
    this.cleanup(ws);
    this.broadcastPresence();
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    const connId = this.connIds.get(ws) ?? "?";
    console.log(`[room] error ${connId}: ${error}`);
    this.cleanup(ws);
    this.broadcastPresence();
  }

  async alarm() {
    this.heartbeatAlarm = false;
    const now = Date.now();
    let culled = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const last = this.lastSeen.get(ws) ?? 0;
      if (now - last > STALE_TIMEOUT_MS && ws.readyState === WebSocket.READY_STATE_OPEN) {
        const connId = this.connIds.get(ws) ?? "?";
        console.log(`[room] stale-close ${connId} (last seen ${now - last}ms ago)`);
        this.cleanup(ws);
        culled++;
      }
    }
    if (culled > 0) this.broadcastPresence();
    if (this.getOpenSockets().length > 0) await this.ensureHeartbeatAlarm();
  }

  // --- Artifacts ---

  private addArtifact(title: string, artifactType: string, content: string, createdBy: string) {
    const artifact: Artifact = {
      id: crypto.randomUUID(),
      type: artifactType,
      title,
      content,
      createdAt: Date.now(),
      createdBy,
    };
    this.artifacts.push(artifact);
    this.ctx.storage.put(SK_ARTIFACTS, this.artifacts);
    this.broadcast({ type: "artifact_created", artifact });
  }

  private buildArtifactPrompt(artifactType: string, title: string): string {
    const typeInstructions: Record<string, string> = {
      summary: "Create a concise summary of the recent discussion. Include key points and open questions.",
      plan: "Create an action plan based on the recent discussion. List concrete next steps with owners if mentioned.",
      notes: "Create clean, organized notes from the recent discussion.",
      custom: title ? `Create content about: ${title}` : "Create useful content based on the recent discussion.",
    };
    return typeInstructions[artifactType] || typeInstructions.custom;
  }

  private inferTitle(artifactType: string): string {
    const d = new Date().toLocaleDateString();
    const titles: Record<string, string> = {
      summary: `Summary - ${d}`,
      plan: `Action Plan - ${d}`,
      notes: `Notes - ${d}`,
    };
    return titles[artifactType] || `Artifact - ${d}`;
  }

  // --- Persistence ---

  private schedulePinnedFlush() {
    if (this.pinnedFlushTimer) return;
    this.pinnedFlushTimer = setTimeout(() => {
      this.pinnedFlushTimer = null;
      this.ctx.storage.put(SK_PINNED, this.pinned);
      console.log("[room] flushed pinned");
    }, PINNED_FLUSH_DELAY_MS);
  }

  private maybeFlushHistory() {
    this.historyDirty++;
    if (this.historyDirty >= HISTORY_FLUSH_INTERVAL) {
      this.historyDirty = 0;
      this.ctx.storage.put(SK_HISTORY, this.history);
      console.log("[room] flushed history");
    }
  }

  // --- AI ---

  private triggerAI(userPrompt: string) {
    if (this.aiRunning) {
      this.broadcastSystem("AI is already thinking... please wait.");
      return;
    }
    this.aiRunning = true;
    this.broadcastSystem("AI is thinking...");
    this.callAI(userPrompt)
      .then((response) => {
        this.broadcastChat("AI", response);
        this.ctx.storage.put(SK_HISTORY, this.history);
        this.historyDirty = 0;
      })
      .catch((err) => {
        console.log(`[room] AI error: ${err}`);
        this.broadcastSystem(`AI error: ${String(err)}`);
      })
      .finally(() => { this.aiRunning = false; });
  }

  private async callAI(userPrompt: string): Promise<string> {
    const memoryBlock = this.formatPinnedMemory();
    const selected = this.history.slice(-AI_CONTEXT_MESSAGES);
    const recentMessages = selected.map((m) => `${m.user}: ${m.text}`).join("\n");
    const systemPrompt = [
      "You are the AI host of a collaborative chat room called AgentWorkspaces.",
      "You help summarize and answer questions. Be concise and helpful.",
      "",
      memoryBlock ? `## Pinned Memory\n${memoryBlock}` : "## Pinned Memory\n(none yet)",
      "",
      recentMessages ? `## Recent Messages\n${recentMessages}` : "## Recent Messages\n(none yet)",
    ].join("\n");
    const tsRange = selected.length > 0
      ? `${new Date(selected[0].ts).toISOString()} → ${new Date(selected[selected.length - 1].ts).toISOString()}`
      : "none";
    console.log(
      `[room] AI context: total_history=${this.history.length} selected=${selected.length} range=${tsRange} loaded=${this.loaded} prompt_user="${userPrompt.slice(0, 80)}"`,
    );
    const result = await this.env.AI.run(AI_MODEL, {
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    });
    const text = (result as { response?: string }).response;
    if (typeof text !== "string" || text.length === 0) throw new Error("Empty AI response");
    return text;
  }

  private formatPinnedMemory(): string {
    const parts: string[] = [];
    if (this.pinned.memories.length > 0) parts.push(`Pinned Memories:\n${this.pinned.memories.map((m) => `- ${m}`).join("\n")}`);
    if (this.pinned.todos.length > 0) parts.push(`Todos:\n${this.pinned.todos.map((t) => `- ${t}`).join("\n")}`);
    return parts.join("\n\n");
  }

  // --- Broadcast ---

  private broadcastChat(user: string, text: string) {
    const entry: ChatEntry = { user, text, ts: Date.now() };
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
    this.maybeFlushHistory();
    this.broadcast({ type: "chat", ...entry });
  }

  private broadcastSystem(text: string) {
    this.broadcast({ type: "chat", user: "System", text, ts: Date.now() });
  }

  private broadcastMemoryUpdate() {
    this.broadcast({ type: "memory_update", pinned: this.pinned });
  }

  // --- Connection lifecycle ---

  private cleanup(ws: WebSocket) {
    this.connIds.delete(ws);
    this.clientIds.delete(ws);
    this.userNames.delete(ws);
    this.lastSeen.delete(ws);
    try { ws.close(1011, "cleanup"); } catch { /* already closed */ }
  }

  private async ensureHeartbeatAlarm() {
    if (this.heartbeatAlarm) return;
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_MS);
    this.heartbeatAlarm = true;
  }

  private getOpenSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN);
  }

  private broadcast(obj: Record<string, unknown>) {
    const data = JSON.stringify(obj);
    for (const ws of this.getOpenSockets()) ws.send(data);
  }

  private broadcastPresence() {
    const sockets = this.getOpenSockets();
    const ids = sockets.map((ws) => this.connIds.get(ws) ?? "?");
    console.log(`[room] presence count=${sockets.length} ids=[${ids.join(",")}]`);
    const data = JSON.stringify({ type: "presence", count: sockets.length });
    for (const ws of sockets) ws.send(data);
  }
}
