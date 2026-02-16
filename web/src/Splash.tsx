import { useState } from "react";
import { useLocation } from "wouter";

const DISPLAY_NAME_KEY = "agentworkspaces-display-name";

function randomRoomId() {
  const adjectives = ["swift", "bright", "calm", "bold", "keen", "warm", "cool", "sharp"];
  const nouns = ["falcon", "summit", "river", "forge", "orbit", "prism", "spark", "nexus"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900 + 100);
  return `${adj}-${noun}-${num}`;
}

export function Splash() {
  const [, navigate] = useLocation();
  const [joinId, setJoinId] = useState("");
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem(DISPLAY_NAME_KEY) || "",
  );

  const saveNameAndGo = (roomId: string) => {
    if (displayName.trim()) {
      localStorage.setItem(DISPLAY_NAME_KEY, displayName.trim());
    }
    navigate(`/r/${encodeURIComponent(roomId)}`);
  };

  const handleCreate = () => {
    saveNameAndGo(randomRoomId());
  };

  const handleJoin = () => {
    const id = joinId.trim();
    if (id) saveNameAndGo(id);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950">
      {/* Atmospheric background */}
      <div className="pointer-events-none absolute inset-0">
        {/* Subtle radial glow */}
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-950/20 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-sky-950/15 blur-[100px]" />
        {/* Dot grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg px-6">
        {/* Hero */}
        <div className="animate-splash-rise mb-14 text-center" style={{ animationDelay: "0ms" }}>
          <div className="mb-4 flex items-center justify-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/15 ring-1 ring-emerald-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <path d="M12 3l1.912 5.813a2 2 0 001.272 1.278L21 12l-5.816 1.91a2 2 0 00-1.272 1.277L12 21l-1.912-5.813a2 2 0 00-1.272-1.278L3 12l5.816-1.91a2 2 0 001.272-1.277z" />
              </svg>
            </div>
          </div>
          <h1
            className="text-5xl tracking-tight text-zinc-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            AgentWorkspaces
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-zinc-500">
            Real-time collaboration rooms with a shared AI&nbsp;host, pinned memory, and artifacts.
          </p>
        </div>

        {/* Main card */}
        <div
          className="animate-splash-rise rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm"
          style={{ animationDelay: "100ms" }}
        >
          {/* Display Name */}
          <div className="mb-5">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Display Name
            </label>
            <input
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600 focus:bg-zinc-950"
              placeholder="What should others call you?"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {/* Create Room */}
          <button
            onClick={handleCreate}
            className="group relative w-full overflow-hidden rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-900/25 active:scale-[0.98]"
          >
            <span className="relative z-10">Create New Room</span>
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-4">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-[11px] uppercase tracking-widest text-zinc-600">or join</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          {/* Join Room */}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600 focus:bg-zinc-950"
              placeholder="Enter room ID..."
              value={joinId}
              style={{ fontFamily: "var(--font-mono)" }}
              onChange={(e) => setJoinId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
            />
            <button
              onClick={handleJoin}
              disabled={!joinId.trim()}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
            >
              Join
            </button>
          </div>
        </div>

        {/* Footer hints */}
        <div
          className="animate-splash-rise mt-8 flex items-center justify-center gap-6 text-[11px] text-zinc-600"
          style={{ animationDelay: "200ms" }}
        >
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-1 rounded-full bg-emerald-500/60 animate-pulse-soft" />
            AI-powered
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            End-to-end on Cloudflare
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            Real-time collaboration
          </span>
        </div>
      </div>
    </div>
  );
}
