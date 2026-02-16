interface RoomTabProps {
  roomId: string;
  clientId: string;
}

export function RoomTab({ roomId, clientId }: RoomTabProps) {
  const inviteUrl = `${window.location.origin}/r/${encodeURIComponent(roomId)}`;

  return (
    <div className="space-y-4 text-xs">
      <section>
        <h3 className="mb-1 font-semibold uppercase tracking-wider text-zinc-500">Room ID</h3>
        <p className="font-mono text-zinc-300">{roomId}</p>
      </section>

      <section>
        <h3 className="mb-1 font-semibold uppercase tracking-wider text-zinc-500">Invite Link</h3>
        <div className="flex gap-1">
          <input readOnly value={inviteUrl} className="flex-1 rounded bg-zinc-800 px-2 py-1 font-mono text-zinc-400 outline-none" />
          <button
            onClick={() => navigator.clipboard.writeText(inviteUrl)}
            className="rounded bg-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-600"
          >
            Copy
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-semibold uppercase tracking-wider text-zinc-500">Client ID</h3>
        <p className="font-mono text-zinc-600 break-all">{clientId}</p>
      </section>

      <section>
        <h3 className="mb-1 font-semibold uppercase tracking-wider text-zinc-500">AI Model</h3>
        <p className="text-zinc-400">Workers AI - Llama 3.3 70B</p>
      </section>
    </div>
  );
}
