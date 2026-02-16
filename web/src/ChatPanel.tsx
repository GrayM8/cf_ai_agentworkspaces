import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMsg } from "./types";

const GROUP_WINDOW_MS = 2 * 60 * 1000;

const SLASH_COMMANDS: { command: string; args?: string; description: string }[] = [
  { command: "/remember", args: "<text>", description: "Save a memory to the room's pinned list" },
  { command: "/todo", args: "<text>", description: "Add a todo item to the room's pinned list" },
  { command: "/memory", description: "Display all pinned memories and todos" },
  { command: "/export", description: "Export all room data as JSON" },
  { command: "/reset", description: "Clear all messages, memories, and artifacts" },
  { command: "/summarize", description: "Ask AI to summarize the recent discussion" },
  { command: "@ai", args: "<prompt>", description: "Ask the AI a question" },
];

interface MessageGroup {
  user: string;
  isAI: boolean;
  isSystem: boolean;
  messages: ChatMsg[];
}

function groupMessages(msgs: ChatMsg[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const m of msgs) {
    const last = groups[groups.length - 1];
    if (last && last.user === m.user && m.ts - last.messages[last.messages.length - 1].ts < GROUP_WINDOW_MS) {
      last.messages.push(m);
    } else {
      groups.push({ user: m.user, isAI: m.user === "AI", isSystem: m.user === "System", messages: [m] });
    }
  }
  return groups;
}

function UserInitial({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] font-medium text-zinc-400">
      {letter}
    </div>
  );
}

interface ChatPanelProps {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  connected: boolean;
}

export function ChatPanel({ messages, onSend, connected }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const groups = groupMessages(messages);

  const filtered = useMemo(() => {
    if (!input.startsWith("/") || input.includes(" ")) return [];
    const q = input.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.command.toLowerCase().startsWith(q));
  }, [input]);

  const showPopup = filtered.length > 0;

  useEffect(() => { setSelectedIdx(0); }, [filtered.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectCommand = useCallback((cmd: typeof SLASH_COMMANDS[number]) => {
    setInput(cmd.args ? cmd.command + " " : cmd.command);
    textareaRef.current?.focus();
  }, []);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPopup) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(filtered[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) { onSend(input.trim()); setInput(""); }
    }
  }, [input, onSend, showPopup, filtered, selectedIdx, selectCommand]);

  const prefill = (prefix: string) => setInput(prefix);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {groups.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <p className="text-xs text-zinc-600">No messages yet. Start the conversation or type <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5" style={{ fontFamily: "var(--font-mono)" }}>/</span> for commands.</p>
          </div>
        )}
        {groups.map((g, gi) =>
          g.isSystem ? (
            <div key={gi} className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-zinc-800/60" />
              <span className="text-[11px] text-zinc-600">
                {g.messages.map((m, i) => <span key={i}>{m.text}{i < g.messages.length - 1 && " | "}</span>)}
              </span>
              <div className="h-px flex-1 bg-zinc-800/60" />
            </div>
          ) : g.isAI ? (
            <div key={gi} className="rounded-lg border border-sky-900/25 bg-sky-950/30 px-4 py-3">
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-sky-900/40 text-[10px] font-medium text-sky-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.912 5.813a2 2 0 001.272 1.278L21 12l-5.816 1.91a2 2 0 00-1.272 1.277L12 21l-1.912-5.813a2 2 0 00-1.272-1.278L3 12l5.816-1.91a2 2 0 001.272-1.277z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-sky-400">AI</span>
                <span className="text-[10px] text-zinc-600" style={{ fontFamily: "var(--font-mono)" }}>
                  {new Date(g.messages[0].ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {g.messages.map((m, i) => (
                <div key={i} className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:rounded-lg prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-zinc-950/60 prose-pre:text-zinc-300 prose-code:text-sky-300">
                  <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
                </div>
              ))}
            </div>
          ) : (
            <div key={gi} className="flex gap-3">
              <UserInitial name={g.user} />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-300">{g.user}</span>
                  <span className="text-[10px] text-zinc-600" style={{ fontFamily: "var(--font-mono)" }}>
                    {new Date(g.messages[0].ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {g.messages.map((m, i) => (
                  <p key={i} className="text-sm leading-relaxed text-zinc-400 whitespace-pre-wrap">{m.text}</p>
                ))}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="relative border-t border-zinc-800/60 bg-zinc-950/50 p-4 backdrop-blur-sm">
        {/* Slash command popup */}
        {showPopup && (
          <div className="absolute bottom-full left-3 right-3 z-10 mb-2 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-900 shadow-xl shadow-black/30">
            <div className="border-b border-zinc-800/40 px-3 py-1.5">
              <span className="text-[10px] uppercase tracking-widest text-zinc-600">Commands</span>
            </div>
            {filtered.map((cmd, i) => (
              <button
                key={cmd.command}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${i === selectedIdx ? "bg-zinc-800/70" : "hover:bg-zinc-800/40"}`}
                onMouseDown={(e) => { e.preventDefault(); selectCommand(cmd); }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span
                  className="rounded border border-zinc-700/50 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {cmd.command}
                </span>
                {cmd.args && (
                  <span className="text-[11px] text-zinc-600" style={{ fontFamily: "var(--font-mono)" }}>{cmd.args}</span>
                )}
                <span className="ml-auto text-[11px] text-zinc-600">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick actions */}
        <div className="mb-2.5 flex gap-1.5">
          <button
            onClick={() => prefill("@ai ")}
            className="flex items-center gap-1 rounded border border-zinc-800/60 bg-zinc-900/50 px-2 py-0.5 text-[11px] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.278L21 12l-5.816 1.91a2 2 0 00-1.272 1.277L12 21l-1.912-5.813a2 2 0 00-1.272-1.278L3 12l5.816-1.91a2 2 0 001.272-1.277z" />
            </svg>
            Ask AI
          </button>
          <button
            onClick={() => onSend("/summarize")}
            className="rounded border border-zinc-800/60 bg-zinc-900/50 px-2 py-0.5 text-[11px] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Summarize
          </button>
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600 focus:bg-zinc-900"
            rows={1}
            placeholder={connected ? "Type a message... (Shift+Enter for newline)" : "Connect first"}
            value={input}
            disabled={!connected}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            onClick={() => { if (input.trim()) { onSend(input.trim()); setInput(""); } }}
            disabled={!connected || !input.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 active:scale-[0.97] disabled:opacity-20 disabled:hover:bg-emerald-600"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
