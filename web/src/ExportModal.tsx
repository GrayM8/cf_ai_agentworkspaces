interface ExportModalProps {
  data: string;
  onClose: () => void;
}

export function ExportModal({ data, onClose }: ExportModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[90%] max-w-lg rounded-xl border border-zinc-800/60 bg-zinc-900 p-5 shadow-2xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-medium text-zinc-200">Room Export</h3>
        <textarea
          readOnly
          value={data}
          className="h-64 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400 outline-none"
          style={{ fontFamily: "var(--font-mono)" }}
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(data)}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
          >
            Copy
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-800/60 px-4 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
