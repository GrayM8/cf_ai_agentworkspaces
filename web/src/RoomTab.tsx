interface RoomTabProps {
  roomId: string;
  clientId: string;
}

export function RoomTab({ roomId, clientId }: RoomTabProps) {
  const inviteUrl = `${window.location.origin}/r/${encodeURIComponent(roomId)}`;

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
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">Client ID</h3>
        <p className="break-all text-zinc-600" style={{ fontFamily: "var(--font-mono)" }}>{clientId}</p>
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
    </div>
  );
}
