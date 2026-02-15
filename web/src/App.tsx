import { useCallback, useEffect, useRef, useState } from "react";

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? "http://localhost:8787";
const PING_INTERVAL_MS = 15_000;

interface ChatMsg {
  type: "chat";
  user: string;
  text: string;
  ts: number;
}

interface PresenceMsg {
  type: "presence";
  count: number;
}

type ServerMsg = ChatMsg | PresenceMsg | { type: "pong" };

function randomName() {
  return "User" + Math.floor(Math.random() * 9000 + 1000);
}

export default function App() {
  const [roomId, setRoomId] = useState(
    () => new URLSearchParams(window.location.search).get("room") ?? "demo",
  );
  const [displayName, setDisplayName] = useState(randomName);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [presence, setPresence] = useState(0);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const closeSocket = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    const ws = wsRef.current;
    if (!ws) return;
    wsRef.current = null;
    console.log(`[ws] closing socket readyState=${ws.readyState}`);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, "client disconnect");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, [closeSocket]);

  const connect = useCallback(() => {
    // Guard: don't open a second socket
    if (wsRef.current) {
      console.log(`[ws] connect called but socket exists readyState=${wsRef.current.readyState}`);
      return;
    }

    setStatus("connecting");
    const wsUrl = WORKER_URL.replace(/^http/, "ws") + "/ws/" + encodeURIComponent(roomId);
    console.log(`[ws] connecting to ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      // Verify this is still the active socket
      if (wsRef.current !== ws) {
        console.log("[ws] open fired for stale socket, closing");
        ws.close(1000, "stale");
        return;
      }
      console.log("[ws] open");
      setStatus("connected");

      // Start ping interval
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, PING_INTERVAL_MS);
    });

    ws.addEventListener("message", (e) => {
      const msg: ServerMsg = JSON.parse(e.data);
      if (msg.type === "chat") {
        setMessages((prev) => [...prev, msg]);
      } else if (msg.type === "presence") {
        setPresence(msg.count);
      }
      // pong is silently consumed
    });

    ws.addEventListener("close", (e) => {
      console.log(`[ws] close code=${e.code} reason=${e.reason}`);
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
      // Only update state if this is still the active socket
      if (wsRef.current === ws) {
        wsRef.current = null;
        setStatus("disconnected");
      }
    });

    ws.addEventListener("error", (e) => {
      console.log("[ws] error", e);
      // onclose will fire after onerror, so just let it propagate
    });
  }, [roomId]);

  const disconnect = useCallback(() => {
    console.log("[ws] disconnect clicked");
    closeSocket();
    setStatus("disconnected");
  }, [closeSocket]);

  const send = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !input.trim()) return;
    wsRef.current.send(JSON.stringify({ type: "chat", user: displayName, text: input.trim() }));
    setInput("");
  }, [displayName, input]);

  const connected = status === "connected";

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 600 }}>
      <h1 style={{ margin: "0 0 1rem" }}>EdgeRooms</h1>

      {/* Config row */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <input
          placeholder="Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          disabled={status !== "disconnected"}
          style={{ width: 120 }}
        />
        <input
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ width: 140 }}
        />
        {status === "disconnected" ? (
          <button onClick={connect} disabled={!roomId}>
            Connect
          </button>
        ) : (
          <button onClick={disconnect}>Disconnect</button>
        )}
      </div>

      {/* Status */}
      <div style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "#666" }}>
        Status: <strong>{status}</strong>
        {connected && <> &mdash; {presence} user{presence !== 1 ? "s" : ""} online</>}
      </div>

      {/* Messages */}
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 4,
          height: 300,
          overflowY: "auto",
          padding: "0.5rem",
          marginBottom: "0.5rem",
          background: "#fafafa",
        }}
      >
        {messages.map((m, i) => {
          const isAI = m.user === "AI";
          const isSystem = m.user === "System";
          return (
            <div
              key={i}
              style={{
                marginBottom: "0.25rem",
                ...(isSystem ? { color: "#888", fontStyle: "italic", fontSize: "0.85rem" } : {}),
                ...(isAI ? { background: "#e8f4fd", padding: "0.25rem 0.4rem", borderRadius: 3 } : {}),
              }}
            >
              <strong>{m.user}</strong>: {m.text}
              <span style={{ color: "#999", fontSize: "0.75rem", marginLeft: 8 }}>
                {new Date(m.ts).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          style={{ flex: 1 }}
          placeholder={connected ? "Type a message..." : "Connect first"}
          value={input}
          disabled={!connected}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button onClick={send} disabled={!connected || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
