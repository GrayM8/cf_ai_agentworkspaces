import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_TIMEOUT_MS = 45_000;
const MAX_HISTORY = 50;
const AI_CONTEXT_MESSAGES = 30;
const MAX_TOOL_ROUNDS = 5;
const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const HISTORY_FLUSH_INTERVAL = 5;
const PINNED_FLUSH_DELAY_MS = 1000;

let nextConnId = 1;

interface ChatEntry {
  user: string;
  text: string;
  ts: number;
}

interface TodoItem {
  text: string;
  done: boolean;
}

interface PinnedMemory {
  memories: string[];
  todos: TodoItem[];
}

interface Artifact {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: number;
  createdBy: string;
}

interface RoomSettings {
  systemPrompt: string;
  aiAutoRespond: boolean;
}

const DEFAULT_SYSTEM_PROMPT = "You are a friendly AI participant in a collaborative chat room called AgentWorkspaces. Chat naturally, be warm and conversational, and engage with what people are saying. You can also help with tasks, answer questions, and summarize discussions when asked. Keep responses concise but never robotic — you're part of the group, not a help desk.";
const DEFAULT_SETTINGS: RoomSettings = { systemPrompt: DEFAULT_SYSTEM_PROMPT, aiAutoRespond: false };

const SK_PINNED = "pinned";
const SK_HISTORY = "history";
const SK_ARTIFACTS = "artifacts";
const SK_SETTINGS = "settings";

export class Room extends DurableObject<Env> {
  private connIds = new Map<WebSocket, string>();
  private clientIds = new Map<WebSocket, string>();
  private userNames = new Map<WebSocket, string>();
  private lastSeen = new Map<WebSocket, number>();
  private heartbeatAlarm = false;
  private history: ChatEntry[] = [];
  private pinned: PinnedMemory = { memories: [], todos: [] };
  private artifacts: Artifact[] = [];
  private settings: RoomSettings = { ...DEFAULT_SETTINGS };
  private aiRunning = false;

  private loaded = false;
  private historyDirty = 0;
  private pinnedFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    const map = await this.ctx.storage.get([SK_PINNED, SK_HISTORY, SK_ARTIFACTS, SK_SETTINGS]);
    if (map.has(SK_PINNED)) {
      this.pinned = map.get(SK_PINNED) as PinnedMemory;
      // Migrate old string[] todos to TodoItem[]
      if (this.pinned.todos.length > 0 && typeof this.pinned.todos[0] === "string") {
        this.pinned.todos = (this.pinned.todos as unknown as string[]).map((t) => ({ text: t, done: false }));
        this.ctx.storage.put(SK_PINNED, this.pinned);
        console.log("[room] migrated todos from string[] to TodoItem[]");
      }
    }
    if (map.has(SK_HISTORY)) this.history = map.get(SK_HISTORY) as ChatEntry[];
    if (map.has(SK_ARTIFACTS)) this.artifacts = map.get(SK_ARTIFACTS) as Artifact[];
    if (map.has(SK_SETTINGS)) this.settings = { ...DEFAULT_SETTINGS, ...(map.get(SK_SETTINGS) as Partial<RoomSettings>) };
    console.log(`[room] loaded: memories=${this.pinned.memories.length} history=${this.history.length} artifacts=${this.artifacts.length}`);
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
      ws.send(JSON.stringify({ type: "settings_update", settings: this.settings }));
      return;
    }

    // --- Memory actions ---
    if (type === "memory.add") {
      const kind = msg.kind as string;
      const text = (msg.text as string || "").trim();
      if (!text || !["memories", "todos"].includes(kind)) return;
      if (kind === "todos") this.doAddTodo(text);
      else this.doAddMemory(text);
      return;
    }

    if (type === "memory.remove") {
      const kind = msg.kind as string;
      const index = msg.index as number;
      if (!["memories", "todos"].includes(kind)) return;
      if (kind === "todos") this.doDeleteTodo(index);
      else this.doDeleteMemory(index);
      return;
    }

    if (type === "memory.toggle") {
      this.doToggleTodo(msg.index as number);
      return;
    }

    // --- Settings ---
    if (type === "settings.update") {
      const updates = msg.settings as Partial<RoomSettings>;
      if (typeof updates.systemPrompt === "string") this.settings.systemPrompt = updates.systemPrompt;
      if (typeof updates.aiAutoRespond === "boolean") this.settings.aiAutoRespond = updates.aiAutoRespond;
      this.ctx.storage.put(SK_SETTINGS, this.settings);
      this.broadcast({ type: "settings_update", settings: this.settings });
      return;
    }

    // --- Artifact actions ---
    if (type === "artifact.create") {
      const mode = msg.mode as string;
      const artifactType = (msg.artifactType as string) || "notes";
      const title = (msg.title as string) || "";
      const content = (msg.content as string) || "";
      const userName = (msg.user as string) || this.userNames.get(ws) || "Unknown";

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
      this.doDeleteArtifact(msg.id as string);
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
      if (mem) this.doAddMemory(mem);
    } else if (text.startsWith("/todo ")) {
      const t = text.slice("/todo ".length).trim();
      if (t) this.doAddTodo(t);
    } else if (text === "/memory") {
      this.broadcastSystem(this.formatPinnedMemory() || "No pinned memory yet.");
    } else if (text === "/export") {
      const data = { pinned: this.pinned, history: this.history, artifacts: this.artifacts };
      this.broadcast({ type: "export", data });
    } else if (text === "/reset") {
      this.pinned = { memories: [], todos: [] };
      this.history = [];
      this.artifacts = [];
      this.settings = { ...DEFAULT_SETTINGS };
      await this.ctx.storage.put({ [SK_PINNED]: this.pinned, [SK_HISTORY]: this.history, [SK_ARTIFACTS]: this.artifacts, [SK_SETTINGS]: this.settings });
      this.broadcastMemoryUpdate();
      this.broadcast({ type: "artifact_list", items: [] });
      this.broadcast({ type: "settings_update", settings: this.settings });
      this.broadcast({ type: "clear_chat" });
      this.broadcastSystem("Room has been reset by " + (user || "someone") + ".");
    } else if (text === "/summarize") {
      this.triggerAI("Summarize the recent discussion concisely. Highlight key points and open questions.");
    } else if (text.startsWith("@ai ")) {
      const q = text.slice("@ai ".length).trim();
      if (q) this.triggerAI(q);
    } else if (this.settings.aiAutoRespond && !text.startsWith("/")) {
      this.triggerAI(`Respond to the latest message from ${user}: "${text}"`);
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

  // --- Reusable mutations (used by WS handlers and AI tools) ---

  private doAddMemory(text: string): string {
    this.pinned.memories.push(text);
    this.schedulePinnedFlush();
    this.broadcastMemoryUpdate();
    return `Added memory: "${text}"`;
  }

  private doDeleteMemory(index: number): string {
    if (index < 0 || index >= this.pinned.memories.length) return `Invalid memory index ${index}. There are ${this.pinned.memories.length} memories (0-indexed).`;
    const removed = this.pinned.memories.splice(index, 1)[0];
    this.schedulePinnedFlush();
    this.broadcastMemoryUpdate();
    return `Deleted memory at index ${index}: "${removed}"`;
  }

  private doAddTodo(text: string): string {
    this.pinned.todos.push({ text, done: false });
    this.schedulePinnedFlush();
    this.broadcastMemoryUpdate();
    return `Added todo: "${text}"`;
  }

  private doDeleteTodo(index: number): string {
    if (index < 0 || index >= this.pinned.todos.length) return `Invalid todo index ${index}. There are ${this.pinned.todos.length} todos (0-indexed).`;
    const removed = this.pinned.todos.splice(index, 1)[0];
    this.schedulePinnedFlush();
    this.broadcastMemoryUpdate();
    return `Deleted todo at index ${index}: "${removed.text}"`;
  }

  private doToggleTodo(index: number): string {
    if (index < 0 || index >= this.pinned.todos.length) return `Invalid todo index ${index}. There are ${this.pinned.todos.length} todos (0-indexed).`;
    this.pinned.todos[index].done = !this.pinned.todos[index].done;
    this.schedulePinnedFlush();
    this.broadcastMemoryUpdate();
    return `Todo "${this.pinned.todos[index].text}" marked as ${this.pinned.todos[index].done ? "complete" : "incomplete"}`;
  }

  private doCreateArtifact(title: string, artifactType: string, content: string): string {
    this.addArtifact(title, artifactType, content, "AI");
    return `Created artifact: "${title}" (type: ${artifactType})`;
  }

  private doClearMemories(): string {
    const count = this.pinned.memories.length;
    if (count === 0) return "No memories to clear.";
    this.pinned.memories = [];
    this.schedulePinnedFlush();
    this.broadcastMemoryUpdate();
    return `Cleared all ${count} memories.`;
  }

  private doClearTodos(): string {
    const count = this.pinned.todos.length;
    if (count === 0) return "No todos to clear.";
    this.pinned.todos = [];
    this.schedulePinnedFlush();
    this.broadcastMemoryUpdate();
    return `Cleared all ${count} todos.`;
  }

  private doDeleteArtifact(id: string): string {
    const artifact = this.artifacts.find((a) => a.id === id || a.title.toLowerCase() === id.toLowerCase());
    if (!artifact) return `Artifact not found: "${id}". Available: ${this.artifacts.map((a) => `"${a.title}" (${a.id})`).join(", ") || "none"}`;
    this.artifacts = this.artifacts.filter((a) => a.id !== artifact.id);
    this.ctx.storage.put(SK_ARTIFACTS, this.artifacts);
    this.broadcast({ type: "artifact_deleted", id: artifact.id });
    return `Deleted artifact: "${artifact.title}"`;
  }

  // --- AI Tool Definitions ---

  private getAITools() {
    return [
      {
        type: "function" as const,
        function: {
          name: "add_memory",
          description: "Add a pinned memory to the room. Use this to save important information for future reference.",
          parameters: {
            type: "object",
            properties: { text: { type: "string", description: "The memory text to pin" } },
            required: ["text"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "delete_memory",
          description: "Delete a pinned memory by its index (0-based). Check the pinned memories list for current indices.",
          parameters: {
            type: "object",
            properties: { index: { type: "number", description: "The 0-based index of the memory to delete" } },
            required: ["index"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "add_todo",
          description: "Add a todo item to the room's todo list.",
          parameters: {
            type: "object",
            properties: { text: { type: "string", description: "The todo text" } },
            required: ["text"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "delete_todo",
          description: "Delete a todo item by its index (0-based).",
          parameters: {
            type: "object",
            properties: { index: { type: "number", description: "The 0-based index of the todo to delete" } },
            required: ["index"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "toggle_todo",
          description: "Toggle a todo item between complete and incomplete by its index (0-based).",
          parameters: {
            type: "object",
            properties: { index: { type: "number", description: "The 0-based index of the todo to toggle" } },
            required: ["index"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_artifact",
          description: "Create a new artifact (document) in the room. Use for longer content like summaries, plans, notes, or any structured content.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "The artifact title" },
              type: { type: "string", enum: ["summary", "plan", "notes", "custom"], description: "The artifact type" },
              content: { type: "string", description: "The artifact content (supports Markdown)" },
            },
            required: ["title", "type", "content"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "clear_memories",
          description: "Delete ALL pinned memories at once. Use when asked to remove all memories or clear the memory list.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "clear_todos",
          description: "Delete ALL todo items at once. Use when asked to remove all todos or clear the todo list.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "delete_artifact",
          description: "Delete an artifact by its ID or title.",
          parameters: {
            type: "object",
            properties: { id: { type: "string", description: "The artifact ID or title" } },
            required: ["id"],
          },
        },
      },
    ];
  }

  private executeToolCall(name: string, args: Record<string, unknown>): string {
    try {
      switch (name) {
        case "add_memory": return this.doAddMemory(String(args.text ?? ""));
        case "delete_memory": return this.doDeleteMemory(Number(args.index ?? -1));
        case "add_todo": return this.doAddTodo(String(args.text ?? ""));
        case "delete_todo": return this.doDeleteTodo(Number(args.index ?? -1));
        case "toggle_todo": return this.doToggleTodo(Number(args.index ?? -1));
        case "clear_memories": return this.doClearMemories();
        case "clear_todos": return this.doClearTodos();
        case "create_artifact": return this.doCreateArtifact(String(args.title ?? "Untitled"), String(args.type ?? "notes"), String(args.content ?? ""));
        case "delete_artifact": return this.doDeleteArtifact(String(args.id ?? ""));
        default: return `Unknown tool: ${name}`;
      }
    } catch (err) {
      return `Tool error: ${String(err)}`;
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
    const basePrompt = this.settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const toolInstructions = "You also have tools to manage memories, todos, and artifacts — but only use them when someone explicitly asks. For normal conversation, just chat naturally and be friendly.";
    const systemPrompt = [
      basePrompt,
      "",
      toolInstructions,
      "",
      memoryBlock ? `## Pinned Memory\n${memoryBlock}` : "",
      this.artifacts.length > 0
        ? `## Artifacts\n${this.artifacts.map((a, i) => `${i}. "${a.title}" (type: ${a.type}, id: ${a.id})`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");

    // Build user message with recent conversation context embedded directly
    const userMessage = recentMessages
      ? `Here is the recent conversation in the chat room:\n\n${recentMessages}\n\nNow respond to this: ${userPrompt}`
      : userPrompt;

    const tsRange = selected.length > 0
      ? `${new Date(selected[0].ts).toISOString()} → ${new Date(selected[selected.length - 1].ts).toISOString()}`
      : "none";
    console.log(
      `[room] AI context: total_history=${this.history.length} selected=${selected.length} range=${tsRange} loaded=${this.loaded} prompt_user="${userPrompt.slice(0, 80)}"`,
    );

    const tools = this.getAITools();
    type Msg = { role: string; content?: string; name?: string; tool_call_id?: string };
    const messages: Msg[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    // First call: with tools, allowing the model to decide whether to use them
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.env.AI as any).run(AI_MODEL, { messages, tools });
    const res = result as { response?: string; tool_calls?: { name: string; arguments: Record<string, unknown> }[] };

    // If no tool calls, return the text response directly
    if (!res.tool_calls || res.tool_calls.length === 0) {
      const text = res.response;
      if (typeof text !== "string" || text.length === 0) throw new Error("Empty AI response");
      return text;
    }

    // Execute all tool calls from this round
    console.log(`[room] AI tools: ${res.tool_calls.length} call(s)`);
    messages.push({ role: "assistant", content: res.response ?? "" });

    for (const call of res.tool_calls) {
      const args = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments;
      console.log(`[room] AI tool: ${call.name}(${JSON.stringify(args)})`);
      const toolResult = this.executeToolCall(call.name, args);
      console.log(`[room] AI tool result: ${toolResult}`);
      messages.push({ role: "tool", name: call.name, content: toolResult });
    }

    // Second call: WITHOUT tools, forcing a text response to confirm what was done
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const final = await (this.env.AI as any).run(AI_MODEL, { messages });
    const text = (final as { response?: string }).response;
    if (typeof text !== "string" || text.length === 0) throw new Error("Empty AI response after tool calls");
    return text;
  }

  private formatPinnedMemory(): string {
    const parts: string[] = [];
    if (this.pinned.memories.length > 0) parts.push(`Pinned Memories:\n${this.pinned.memories.map((m, i) => `[${i}] ${m}`).join("\n")}`);
    if (this.pinned.todos.length > 0) parts.push(`Todos:\n${this.pinned.todos.map((t, i) => `[${i}] [${t.done ? "x" : " "}] ${t.text}`).join("\n")}`);
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
