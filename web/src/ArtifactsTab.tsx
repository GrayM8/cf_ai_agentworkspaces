import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactMeta, ArtifactFull } from "./types";

interface ArtifactsTabProps {
  artifacts: ArtifactMeta[];
  detail: ArtifactFull | null;
  isOwner: boolean;
  onCreate: (opts: { mode: "ai" | "manual"; artifactType: string; title?: string; content?: string }) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onCloseDetail: () => void;
}

const TYPES = ["summary", "plan", "notes", "custom"] as const;

export function ArtifactsTab({ artifacts, detail, isOwner, onCreate, onDelete, onOpen, onCloseDetail }: ArtifactsTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [artifactType, setArtifactType] = useState<string>("summary");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const submit = () => {
    onCreate({ mode, artifactType, title: title || undefined, content: mode === "manual" ? content : undefined });
    setShowCreate(false);
    setTitle("");
    setContent("");
  };

  // Detail view
  if (detail) {
    return (
      <div className="space-y-3">
        <button onClick={onCloseDetail} className="flex items-center gap-1 text-[11px] text-zinc-500 transition hover:text-zinc-300">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to list
        </button>
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded border border-zinc-700/50 bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{detail.type}</span>
            <h3 className="text-sm font-medium text-zinc-200">{detail.title}</h3>
          </div>
          <p className="mb-3 text-[10px] text-zinc-600" style={{ fontFamily: "var(--font-mono)" }}>
            {detail.createdBy} &middot; {new Date(detail.createdAt).toLocaleString()}
          </p>
          <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:rounded-lg prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-zinc-950/60 prose-pre:text-zinc-300">
            <Markdown remarkPlugins={[remarkGfm]}>{detail.content}</Markdown>
          </div>
          <div className="mt-4 flex gap-2 border-t border-zinc-800/40 pt-3">
            <button
              onClick={() => navigator.clipboard.writeText(detail.content)}
              className="rounded border border-zinc-800/60 px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-300"
            >
              Copy
            </button>
            {isOwner && (
              confirmDelete === detail.id ? (
                <button
                  onClick={() => { onDelete(detail.id); onCloseDetail(); setConfirmDelete(null); }}
                  className="rounded bg-red-900/30 px-2.5 py-1 text-[11px] text-red-400 transition hover:bg-red-900/50"
                >
                  Confirm Delete
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(detail.id)}
                  className="rounded border border-zinc-800/60 px-2.5 py-1 text-[11px] text-red-500/60 transition hover:text-red-400"
                >
                  Delete
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowCreate(!showCreate)}
        className={`w-full rounded-lg border py-2 text-[11px] font-medium transition ${
          showCreate
            ? "border-zinc-700 bg-zinc-800 text-zinc-300"
            : "border-dashed border-zinc-800/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
        }`}
      >
        {showCreate ? "Cancel" : "+ New Artifact"}
      </button>

      {showCreate && (
        <div className="space-y-2.5 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
          {/* Type selector */}
          <div className="flex gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setArtifactType(t)}
                className={`rounded-md px-2 py-1 text-[11px] capitalize transition ${
                  artifactType === t
                    ? "bg-emerald-600/15 text-emerald-400 ring-1 ring-emerald-500/20"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Title */}
          <input
            className="w-full rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Mode toggle */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setMode("ai")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] transition ${
                mode === "ai"
                  ? "bg-sky-950/40 text-sky-400 ring-1 ring-sky-900/30"
                  : "text-zinc-500 hover:text-zinc-400"
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.912 5.813a2 2 0 001.272 1.278L21 12l-5.816 1.91a2 2 0 00-1.272 1.277L12 21l-1.912-5.813a2 2 0 00-1.272-1.278L3 12l5.816-1.91a2 2 0 001.272-1.277z" />
              </svg>
              AI Generate
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`flex-1 rounded-md py-1.5 text-[11px] transition ${
                mode === "manual"
                  ? "bg-zinc-800 text-zinc-200 ring-1 ring-zinc-700"
                  : "text-zinc-500 hover:text-zinc-400"
              }`}
            >
              Manual
            </button>
          </div>

          {/* Manual content */}
          {mode === "manual" && (
            <textarea
              className="w-full resize-none rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-zinc-600"
              rows={4}
              placeholder="Enter content..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          )}

          <button
            onClick={submit}
            className="w-full rounded-md bg-emerald-600 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            Create
          </button>
        </div>
      )}

      {/* List */}
      {artifacts.length === 0 && !showCreate && (
        <div className="rounded-lg border border-dashed border-zinc-800/60 px-3 py-6 text-center">
          <p className="text-[11px] text-zinc-600">No artifacts yet</p>
        </div>
      )}
      {artifacts.map((a) => (
        <button
          key={a.id}
          onClick={() => onOpen(a.id)}
          className="group w-full rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-3 text-left transition hover:border-zinc-700/60 hover:bg-zinc-900/50"
        >
          <div className="flex items-center gap-2">
            <span className="rounded border border-zinc-700/50 bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{a.type}</span>
            <span className="text-xs font-medium text-zinc-300 group-hover:text-zinc-200">{a.title}</span>
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-600" style={{ fontFamily: "var(--font-mono)" }}>
            {a.createdBy} &middot; {new Date(a.createdAt).toLocaleString()}
          </p>
        </button>
      ))}
    </div>
  );
}
