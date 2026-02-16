import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMsg, PinnedMemory, ArtifactMeta, ArtifactFull, RoomSettings, ConnectionStatus } from "./types";

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? "http://localhost:8787";
const PING_INTERVAL_MS = 15_000;

function getClientId(): string {
  const key = "agentworkspaces-client-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export const CLIENT_ID = getClientId();

export function useRoom(roomId: string, displayName: string, autoConnect = false) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [presence, setPresence] = useState(0);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [pinned, setPinned] = useState<PinnedMemory>({ memories: [], todos: [] });
  const [artifacts, setArtifacts] = useState<ArtifactMeta[]>([]);
  const [artifactDetail, setArtifactDetail] = useState<ArtifactFull | null>(null);
  const [settings, setSettings] = useState<RoomSettings>({ systemPrompt: "", aiAutoRespond: false });
  const [exportData, setExportData] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;

  const closeSocket = useCallback(() => {
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
    const ws = wsRef.current;
    if (!ws) return;
    wsRef.current = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, "client disconnect");
    }
  }, []);

  useEffect(() => () => { closeSocket(); }, [closeSocket]);

  const send = useCallback((obj: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) return;
    setStatus("connecting");
    setMessages([]);
    const wsUrl = WORKER_URL.replace(/^http/, "ws") + "/ws/" + encodeURIComponent(roomId);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (wsRef.current !== ws) { ws.close(1000, "stale"); return; }
      setStatus("connected");
      ws.send(JSON.stringify({ type: "hello", clientId: CLIENT_ID, user: displayNameRef.current }));
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, PING_INTERVAL_MS);
    });

    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case "chat":
          setMessages((prev) => [...prev, msg as ChatMsg]);
          break;
        case "clear_chat":
          setMessages([]);
          break;
        case "presence":
          setPresence(msg.count);
          break;
        case "memory_update":
          setPinned(msg.pinned);
          break;
        case "artifact_list":
          setArtifacts(msg.items);
          break;
        case "artifact_created":
          setArtifacts((prev) => [...prev, {
            id: msg.artifact.id,
            type: msg.artifact.type,
            title: msg.artifact.title,
            createdAt: msg.artifact.createdAt,
            createdBy: msg.artifact.createdBy,
          }]);
          setArtifactDetail(msg.artifact);
          break;
        case "artifact_detail":
          setArtifactDetail(msg.artifact);
          break;
        case "artifact_deleted":
          setArtifacts((prev) => prev.filter((a) => a.id !== msg.id));
          setArtifactDetail((prev) => prev?.id === msg.id ? null : prev);
          break;
        case "settings_update":
          setSettings(msg.settings);
          break;
        case "export":
          setExportData(JSON.stringify(msg.data, null, 2));
          break;
      }
    });

    ws.addEventListener("close", () => {
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      if (wsRef.current === ws) { wsRef.current = null; setStatus("disconnected"); }
    });
    ws.addEventListener("error", () => {});
  }, [roomId]);

  // Auto-connect on mount when requested (works safely with StrictMode)
  useEffect(() => {
    if (!autoConnect) return;
    connect();
    return () => { closeSocket(); };
  }, [autoConnect, connect, closeSocket]);

  const disconnect = useCallback(() => { closeSocket(); setStatus("disconnected"); }, [closeSocket]);

  const sendChat = useCallback((text: string) => {
    send({ type: "chat", user: displayNameRef.current, text });
  }, [send]);

  const addMemory = useCallback((kind: "memories" | "todos", text: string) => {
    send({ type: "memory.add", kind, text });
  }, [send]);

  const removeMemory = useCallback((kind: "memories" | "todos", index: number) => {
    send({ type: "memory.remove", kind, index });
  }, [send]);

  const toggleTodo = useCallback((index: number) => {
    send({ type: "memory.toggle", index });
  }, [send]);

  const updateSettings = useCallback((updates: Partial<RoomSettings>) => {
    send({ type: "settings.update", settings: updates });
  }, [send]);

  const createArtifact = useCallback((opts: { mode: "ai" | "manual"; artifactType: string; title?: string; content?: string }) => {
    send({ type: "artifact.create", ...opts, user: displayNameRef.current });
  }, [send]);

  const deleteArtifact = useCallback((id: string) => {
    send({ type: "artifact.delete", id });
  }, [send]);

  const getArtifact = useCallback((id: string) => {
    send({ type: "artifact.get", id });
  }, [send]);

  return {
    messages, presence, status, pinned, artifacts, artifactDetail, setArtifactDetail,
    settings, updateSettings, exportData, setExportData,
    connect, disconnect, sendChat, addMemory, removeMemory, toggleTodo,
    createArtifact, deleteArtifact, getArtifact, send,
  };
}
