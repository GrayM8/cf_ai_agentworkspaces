import { useState } from "react";
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

export function SidePanel(props: SidePanelProps) {
  const [tab, setTab] = useState<Tab>("memory");

  const tabs: { key: Tab; label: string }[] = [
    { key: "memory", label: "Memory" },
    { key: "artifacts", label: "Artifacts" },
    { key: "room", label: "Room" },
  ];

  return (
    <div className="flex h-full flex-col bg-zinc-900/50">
      <div className="flex border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium tracking-wide ${
              tab === t.key ? "border-b-2 border-zinc-400 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
            {t.key === "artifacts" && props.artifacts.length > 0 && (
              <span className="ml-1 text-zinc-600">{props.artifacts.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
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
