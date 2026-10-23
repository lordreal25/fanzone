export type RoomCreds = { secret: string; adminToken?: string };

export type LocalSession = {
  clientId: string;
  name: string;
  aceGateway: string;
  rooms: Record<string, RoomCreds>;
};

const KEY = "fanzone.v1";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `c${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function empty(): LocalSession {
  return { clientId: "", name: "", aceGateway: "", rooms: {} };
}

export function loadSession(): LocalSession {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const created = { ...empty(), clientId: newId() };
      window.localStorage.setItem(KEY, JSON.stringify(created));
      return created;
    }
    const parsed = JSON.parse(raw) as Partial<LocalSession>;
    const session: LocalSession = {
      clientId: typeof parsed.clientId === "string" && parsed.clientId ? parsed.clientId : newId(),
      name: typeof parsed.name === "string" ? parsed.name : "",
      aceGateway: typeof parsed.aceGateway === "string" ? parsed.aceGateway : "",
      rooms: parsed.rooms && typeof parsed.rooms === "object" ? parsed.rooms : {},
    };
    window.localStorage.setItem(KEY, JSON.stringify(session));
    return session;
  } catch {
    return { ...empty(), clientId: newId() };
  }
}

export function saveSession(session: LocalSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(session));
}
