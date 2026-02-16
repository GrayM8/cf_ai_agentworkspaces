import { useState } from "react";
import type { PinnedMemory } from "./types";

interface MemoryTabProps {
  pinned: PinnedMemory;
  onAdd: (kind: "memories" | "todos", text: string) => void;
}

function InlineInput({ placeholder, onSubmit }: { placeholder: string; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] text-emerald-600 transition hover:text-emerald-400">
        + Add
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex gap-1.5">
      <input
        autoFocus
        className="flex-1 rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 text-xs text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) { onSubmit(value.trim()); setValue(""); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button
        onClick={() => { if (value.trim()) { onSubmit(value.trim()); setValue(""); setOpen(false); } }}
        className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-500"
      >
        Save
      </button>
    </div>
  );
}

export function MemoryTab({ pinned, onAdd }: MemoryTabProps) {
  return (
    <div className="space-y-5 text-sm">
      {/* Pinned Memories */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Pinned Memories</h3>
          <InlineInput placeholder="Add memory..." onSubmit={(v) => onAdd("memories", v)} />
        </div>
        {pinned.memories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800/60 px-3 py-4 text-center">
            <p className="text-[11px] text-zinc-600">No pinned memories yet</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {pinned.memories.map((m, i) => (
              <li key={i} className="flex items-start gap-2 rounded border border-zinc-800/40 bg-zinc-900/30 px-2.5 py-1.5 text-xs text-zinc-400">
                <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-500/50" />
                {m}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Todos */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Todos</h3>
          <InlineInput placeholder="Add todo..." onSubmit={(v) => onAdd("todos", v)} />
        </div>
        {pinned.todos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800/60 px-3 py-4 text-center">
            <p className="text-[11px] text-zinc-600">No todos yet</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {pinned.todos.map((t, i) => (
              <li key={i} className="flex items-start gap-2 rounded border border-zinc-800/40 bg-zinc-900/30 px-2.5 py-1.5 text-xs text-zinc-400">
                <span className="mt-0.5 flex h-3 w-3 flex-shrink-0 items-center justify-center rounded border border-zinc-700">
                  <span className="h-1 w-1 rounded-full" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
