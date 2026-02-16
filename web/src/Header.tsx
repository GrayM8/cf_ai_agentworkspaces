import { useState } from "react";
import type { ConnectionStatus } from "./types";

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse-soft",
  disconnected: "bg-zinc-600",
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

interface HeaderProps {
  roomId: string;
  displayName: string;
  setDisplayName: (v: string) => void;
  status: ConnectionStatus;
  presence: number;
  onDisconnect: () => void;
  onExport: () => void;
  onReset: () => void;
}

export function Header({
  roomId, displayName, setDisplayName,
  status, presence,
  onDisconnect, onExport, onReset,
}: HeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyInvite = () => {
    const url = `${window.location.origin}/r/${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <header className="flex items-center gap-4 border-b border-zinc-800/80 bg-zinc-950/80 px-5 py-2.5 backdrop-blur-sm">
      {/* Navigation breadcrumb */}
      <nav className="flex items-center gap-2.5">
        <button
          onClick={onDisconnect}
          className="flex items-center gap-2 transition hover:opacity-80"
          title="Back to home"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-600/15 ring-1 ring-emerald-500/20">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.278L21 12l-5.816 1.91a2 2 0 00-1.272 1.277L12 21l-1.912-5.813a2 2 0 00-1.272-1.278L3 12l5.816-1.91a2 2 0 001.272-1.277z" />
            </svg>
          </div>
          <span
            className="text-base text-zinc-200"
            style={{ fontFamily: "var(--font-display)" }}
          >
            AgentWorkspaces
          </span>
        </button>
        <span className="text-xs text-zinc-700">/</span>
        <span
          className="text-xs text-zinc-400"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {roomId}
        </span>
      </nav>

      {/* Divider */}
      <div className="h-4 w-px bg-zinc-800" />

      {/* User identity */}
      <div className="flex items-center gap-1.5 rounded border border-zinc-800/60 bg-zinc-900/50 px-2.5 py-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-zinc-600">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <input
          className="w-24 bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-600"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-4">
        {/* Status */}
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_COLORS[status]}`} />
          {STATUS_LABELS[status]}
        </div>

        {/* Presence */}
        {status === "connected" && (
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            {presence}
          </span>
        )}

        {/* Separator */}
        {status === "connected" && <div className="h-3 w-px bg-zinc-800" />}

        {/* Actions */}
        {status === "connected" && (
          <>
            <button
              onClick={copyInvite}
              className="text-[11px] text-zinc-500 transition hover:text-zinc-300"
              title="Copy invite link"
            >
              {copied ? "Copied!" : "Invite"}
            </button>
            <button onClick={onExport} className="text-[11px] text-zinc-500 transition hover:text-zinc-300">
              Export
            </button>
            <button onClick={onReset} className="text-[11px] text-red-500/50 transition hover:text-red-400">
              Reset
            </button>
          </>
        )}
      </div>
    </header>
  );
}
