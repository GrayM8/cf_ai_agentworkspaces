import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useRoom } from "./useRoom";
import { ChatPanel } from "./ChatPanel";
import { SidePanel } from "./SidePanel";
import { Header } from "./Header";
import { ExportModal } from "./ExportModal";

const DISPLAY_NAME_KEY = "agentworkspaces-display-name";

function randomName() {
  return "User" + Math.floor(Math.random() * 9000 + 1000);
}

export function RoomView({ roomId }: { roomId: string }) {
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem(DISPLAY_NAME_KEY) || randomName(),
  );
  const room = useRoom(roomId, displayName, true);
  const connected = room.status === "connected";

  // Persist display name changes
  useEffect(() => {
    if (displayName.trim()) {
      localStorage.setItem(DISPLAY_NAME_KEY, displayName.trim());
    }
  }, [displayName]);

  const handleDisconnect = () => {
    room.disconnect();
    navigate("/");
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <Header
        roomId={roomId}
        displayName={displayName}
        setDisplayName={setDisplayName}
        status={room.status}
        presence={room.presence}
        onDisconnect={handleDisconnect}
        onExport={() => room.sendChat("/export")}
        onReset={() => room.sendChat("/reset")}
      />

      {connected ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col border-r border-zinc-800/60">
            <ChatPanel
              messages={room.messages}
              onSend={room.sendChat}
              connected={connected}
            />
          </div>
          <div className="w-96 flex-shrink-0 overflow-hidden">
            <SidePanel
              pinned={room.pinned}
              artifacts={room.artifacts}
              artifactDetail={room.artifactDetail}
              isOwner={room.isOwner}
              roomId={roomId}
              onAddMemory={room.addMemory}
              onCreateArtifact={room.createArtifact}
              onDeleteArtifact={room.deleteArtifact}
              onGetArtifact={room.getArtifact}
              onSetArtifactDetail={room.setArtifactDetail}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          {room.status === "connecting" ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500" />
              </div>
              <p className="text-sm text-zinc-500">Connecting to room...</p>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">Failed to connect to room.</p>
              <button
                onClick={() => room.connect()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}

      {room.exportData && (
        <ExportModal data={room.exportData} onClose={() => room.setExportData(null)} />
      )}
    </div>
  );
}
