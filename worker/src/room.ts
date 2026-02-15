import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_TIMEOUT_MS = 45_000;
const MAX_HISTORY = 50;
const AI_CONTEXT_MESSAGES = 20;
const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

let nextConnId = 1;

interface ChatEntry {
  user: string;
  text: string;
  ts: number;
}

interface PinnedMemory {
  goal?: string;
  facts: string[];
  decisions: string[];
  todos: string[];
}

export class Room extends DurableObject<Env> {
  private connIds = new Map<WebSocket, string>();
  private lastSeen = new Map<WebSocket, number>();
  private heartbeatAlarm = false;
  private history: ChatEntry[] = [];
  private pinned: PinnedMemory = { facts: [], decisions: [], todos: [] };
  private aiRunning = false;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

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

    let msg: { type?: string; user?: string; text?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    this.lastSeen.set(ws, Date.now());

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (msg.type !== "chat") return;
    if (typeof msg.user !== "string" || msg.user.length === 0 || msg.user.length > 64) return;
    if (typeof msg.text !== "string" || msg.text.length === 0 || msg.text.length > 2000) return;

    const text = msg.text.trim();
    const user = msg.user;

    // Broadcast the user's message first
    this.broadcastChat(user, text);

    // Handle commands
    if (text.startsWith("/remember ")) {
      const fact = text.slice("/remember ".length).trim();
      if (fact) {
        this.pinned.facts.push(fact);
        this.broadcastSystem(`Remembered: "${fact}"`);
      }
    } else if (text.startsWith("/decide ")) {
      const decision = text.slice("/decide ".length).trim();
      if (decision) {
        this.pinned.decisions.push(decision);
        this.broadcastSystem(`Decision recorded: "${decision}"`);
      }
    } else if (text.startsWith("/todo ")) {
      const todo = text.slice("/todo ".length).trim();
      if (todo) {
        this.pinned.todos.push(todo);
        this.broadcastSystem(`Todo added: "${todo}"`);
      }
    } else if (text === "/memory") {
      this.broadcastSystem(this.formatPinnedMemory() || "No pinned memory yet.");
    } else if (text === "/summarize") {
      this.triggerAI("Summarize the recent discussion concisely. Highlight key points, open questions, and any decisions made.");
    } else if (text.startsWith("@ai ")) {
      const question = text.slice("@ai ".length).trim();
      if (question) {
        this.triggerAI(question);
      }
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

    if (culled > 0) {
      this.broadcastPresence();
    }

    if (this.getOpenSockets().length > 0) {
      await this.ensureHeartbeatAlarm();
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
      })
      .catch((err) => {
        console.log(`[room] AI error: ${err}`);
        this.broadcastSystem(`AI error: ${String(err)}`);
      })
      .finally(() => {
        this.aiRunning = false;
      });
  }

  private async callAI(userPrompt: string): Promise<string> {
    const memoryBlock = this.formatPinnedMemory();
    const recentMessages = this.history
      .slice(-AI_CONTEXT_MESSAGES)
      .map((m) => `${m.user}: ${m.text}`)
      .join("\n");

    const systemPrompt = [
      "You are the AI host of a collaborative chat room called EdgeRooms.",
      "You help summarize, clarify decisions, and answer questions.",
      "Be concise and helpful.",
      "",
      memoryBlock ? `## Pinned Memory\n${memoryBlock}` : "## Pinned Memory\n(none yet)",
      "",
      recentMessages ? `## Recent Messages\n${recentMessages}` : "## Recent Messages\n(none yet)",
    ].join("\n");

    console.log(`[room] AI prompt system=${systemPrompt.length}chars user="${userPrompt.slice(0, 80)}"`);

    const result = await this.env.AI.run(AI_MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = (result as { response?: string }).response;
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("Empty AI response");
    }
    return text;
  }

  private formatPinnedMemory(): string {
    const parts: string[] = [];
    if (this.pinned.goal) parts.push(`Goal: ${this.pinned.goal}`);
    if (this.pinned.facts.length > 0) parts.push(`Facts:\n${this.pinned.facts.map((f) => `- ${f}`).join("\n")}`);
    if (this.pinned.decisions.length > 0)
      parts.push(`Decisions:\n${this.pinned.decisions.map((d) => `- ${d}`).join("\n")}`);
    if (this.pinned.todos.length > 0) parts.push(`Todos:\n${this.pinned.todos.map((t) => `- ${t}`).join("\n")}`);
    return parts.join("\n\n");
  }

  // --- Broadcast helpers ---

  private broadcastChat(user: string, text: string) {
    const entry: ChatEntry = { user, text, ts: Date.now() };
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HISTORY);
    }
    this.broadcast({ type: "chat", ...entry });
  }

  private broadcastSystem(text: string) {
    this.broadcast({ type: "chat", user: "System", text, ts: Date.now() });
  }

  // --- Connection lifecycle ---

  private cleanup(ws: WebSocket) {
    this.connIds.delete(ws);
    this.lastSeen.delete(ws);
    try {
      ws.close(1011, "cleanup");
    } catch {
      // already closed
    }
  }

  private async ensureHeartbeatAlarm() {
    if (this.heartbeatAlarm) return;
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_MS);
    }
    this.heartbeatAlarm = true;
  }

  private getOpenSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN);
  }

  private broadcast(obj: Record<string, unknown>) {
    const data = JSON.stringify(obj);
    for (const ws of this.getOpenSockets()) {
      ws.send(data);
    }
  }

  private broadcastPresence() {
    const sockets = this.getOpenSockets();
    const ids = sockets.map((ws) => this.connIds.get(ws) ?? "?");
    console.log(`[room] presence count=${sockets.length} ids=[${ids.join(",")}]`);
    const data = JSON.stringify({ type: "presence", count: sockets.length });
    for (const ws of sockets) {
      ws.send(data);
    }
  }
}
