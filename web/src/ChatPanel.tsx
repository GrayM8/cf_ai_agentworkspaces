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
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {groups.map((g, gi) =>
          g.isSystem ? (
            <div key={gi} className="text-center text-xs text-zinc-600 py-1">
              {g.messages.map((m, i) => <span key={i}>{m.text}{i < g.messages.length - 1 && " | "}</span>)}
            </div>
          ) : (
            <div key={gi} className={`rounded-lg px-3 py-2 ${g.isAI ? "bg-sky-950/40 border border-sky-900/30" : "bg-zinc-900"}`}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`text-sm font-medium ${g.isAI ? "text-sky-400" : "text-zinc-300"}`}>
                  {g.user}
                </span>
                {g.isAI && <span className="rounded bg-sky-900/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sky-400">AI</span>}
                <span className="text-[10px] text-zinc-600">
                  {new Date(g.messages[0].ts).toLocaleTimeString()}
                </span>
              </div>
              {g.messages.map((m, i) =>
                g.isAI ? (
                  <div key={i} className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:text-zinc-300">
                    <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
                  </div>
                ) : (
                  <p key={i} className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{m.text}</p>
                ),
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="relative border-t border-zinc-800 bg-zinc-900 p-3">
        {showPopup && (
          <div className="absolute bottom-full left-0 right-0 z-10 mb-0 border-b border-zinc-700 bg-zinc-850 shadow-lg">
            {filtered.map((cmd, i) => (
              <button
                key={cmd.command}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${i === selectedIdx ? "bg-zinc-700/60" : "hover:bg-zinc-800"}`}
                onMouseDown={(e) => { e.preventDefault(); selectCommand(cmd); }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="font-mono font-medium text-zinc-200">{cmd.command}</span>
                {cmd.args && <span className="font-mono text-xs text-zinc-500">{cmd.args}</span>}
                <span className="ml-auto text-xs text-zinc-500">{cmd.description}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mb-2 flex gap-1.5">
          <button onClick={() => prefill("@ai ")} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200">
            Ask AI
          </button>
          <button onClick={() => onSend("/summarize")} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200">
            Summarize
          </button>
        </div>
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600"
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
            className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-600 disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
