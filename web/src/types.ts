export interface ChatMsg {
  type: "chat";
  user: string;
  text: string;
  ts: number;
}

export interface TodoItem {
  text: string;
  done: boolean;
}

export interface PinnedMemory {
  memories: string[];
  todos: TodoItem[];
}

export interface ArtifactMeta {
  id: string;
  type: string;
  title: string;
  createdAt: number;
  createdBy: string;
}

export interface ArtifactFull extends ArtifactMeta {
  content: string;
}

export interface RoomSettings {
  systemPrompt: string;
  aiAutoRespond: boolean;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected";
