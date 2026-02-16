import { type JSX, useState } from "react";
import type { PinnedMemory, ArtifactMeta, ArtifactFull } from "./types";
import { MemoryTab } from "./MemoryTab";
import { ArtifactsTab } from "./ArtifactsTab";
import { RoomTab } from "./RoomTab";
import { CLIENT_ID } from "./useRoom";

type Tab = "memory" | "artifacts" | "room";

interface SidePanelProps {
  pinned: PinnedMemory;
  artifacts: ArtifactMeta[];
  artifactDetail: ArtifactFull | null;
  isOwner: boolean;
  roomId: string;
  onAddMemory: (kind: "memories" | "todos", text: string) => void;
  onCreateArtifact: (opts: { mode: "ai" | "manual"; artifactType: string; title?: string; content?: string }) => void;
  onDeleteArtifact: (id: string) => void;
  onGetArtifact: (id: string) => void;
  onSetArtifactDetail: (a: ArtifactFull | null) => void;
}

const TAB_ICONS: Record<Tab, JSX.Element> = {
  memory: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 0110 10c0 5.52-4.48 10-10 10S2 17.52 2 12" />
      <path d="M12 2c3 3.5 3 8.5 0 12" />
      <path d="M2 12h10" />
    </svg>
  ),
  artifacts: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  room: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

export function SidePanel(props: SidePanelProps) {
  const [tab, setTab] = useState<Tab>("memory");

  const tabs: { key: Tab; label: string }[] = [
    { key: "memory", label: "Memory" },
    { key: "artifacts", label: "Artifacts" },
    { key: "room", label: "Room" },
  ];

  return (
    <div className="flex h-full flex-col bg-zinc-950/40 backdrop-blur-sm">
      <div className="flex border-b border-zinc-800/60">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium uppercase tracking-widest transition ${
              tab === t.key
                ? "border-b-2 border-emerald-500/70 text-zinc-200"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            <span className={tab === t.key ? "text-emerald-400" : ""}>{TAB_ICONS[t.key]}</span>
            {t.label}
            {t.key === "artifacts" && props.artifacts.length > 0 && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[9px] text-zinc-400">
                {props.artifacts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "memory" && <MemoryTab pinned={props.pinned} onAdd={props.onAddMemory} />}
        {tab === "artifacts" && (
          <ArtifactsTab
            artifacts={props.artifacts}
            detail={props.artifactDetail}
            isOwner={props.isOwner}
            onCreate={props.onCreateArtifact}
            onDelete={props.onDeleteArtifact}
            onOpen={props.onGetArtifact}
            onCloseDetail={() => props.onSetArtifactDetail(null)}
          />
        )}
        {tab === "room" && <RoomTab roomId={props.roomId} clientId={CLIENT_ID} />}
      </div>
    </div>
  );
}
