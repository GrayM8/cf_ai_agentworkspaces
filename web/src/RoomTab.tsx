import { useState, useEffect, useRef } from "react";
import type { RoomSettings } from "./types";

interface RoomTabProps {
  roomId: string;
  clientId: string;
  settings: RoomSettings;
  onUpdateSettings: (updates: Partial<RoomSettings>) => void;
}

export function RoomTab({ roomId, clientId, settings, onUpdateSettings }: RoomTabProps) {
  const inviteUrl = `${window.location.origin}/r/${encodeURIComponent(roomId)}`;
  const [localPrompt, setLocalPrompt] = useState(settings.systemPrompt);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from server when settings change externally
  useEffect(() => {
    setLocalPrompt(settings.systemPrompt);
  }, [settings.systemPrompt]);

  const handlePromptChange = (value: string) => {
    setLocalPrompt(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdateSettings({ systemPrompt: value });
    }, 800);
  };

  return (
    <div className="space-y-5 text-xs">
      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Room ID</h3>
        <p className="text-zinc-300" style={{ fontFamily: "var(--font-mono)" }}>{roomId}</p>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Invite Link</h3>
        <div className="flex gap-1.5">
          <input
            readOnly
            value={inviteUrl}
            className="flex-1 rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-zinc-500 outline-none"
            style={{ fontFamily: "var(--font-mono)" }}
          />
          <button
            onClick={() => navigator.clipboard.writeText(inviteUrl)}
            className="rounded border border-zinc-800/60 px-2.5 py-1.5 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Copy
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">AI Model</h3>
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-sky-950/40">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.278L21 12l-5.816 1.91a2 2 0 00-1.272 1.277L12 21l-1.912-5.813a2 2 0 00-1.272-1.278L3 12l5.816-1.91a2 2 0 001.272-1.277z" />
            </svg>
          </span>
          <span className="text-zinc-400">Workers AI &mdash; Llama 3.3 70B</span>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">AI Auto-Respond</h3>
        <button
          onClick={() => onUpdateSettings({ aiAutoRespond: !settings.aiAutoRespond })}
          className="flex items-center gap-2.5"
        >
          <span className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${settings.aiAutoRespond ? "bg-emerald-600" : "bg-zinc-700"}`}>
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${settings.aiAutoRespond ? "translate-x-3.5" : "translate-x-0.5"} mt-0.5`} />
          </span>
          <span className="text-zinc-400">
            {settings.aiAutoRespond ? "Responds to all messages" : "Only when mentioned with @ai"}
          </span>
        </button>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">System Prompt</h3>
        <textarea
          className="w-full resize-none rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-xs leading-relaxed text-zinc-300 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600"
          rows={5}
          placeholder="Enter a custom system prompt for the AI..."
          value={localPrompt}
          onChange={(e) => handlePromptChange(e.target.value)}
        />
        <p className="mt-1 text-[10px] text-zinc-600">Changes sync to all clients automatically.</p>
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Client ID</h3>
        <p className="break-all text-zinc-600" style={{ fontFamily: "var(--font-mono)" }}>{clientId}</p>
      </section>
    </div>
  );
}
