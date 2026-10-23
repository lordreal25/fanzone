export type Access = "public" | "private";
export type SyncMode = "sync" | "free";
export type MessageKind = "chat" | "system" | "reaction";

export type IframeSource =
  | { kind: "iframe"; provider: "youtube"; videoId: string }
  | { kind: "iframe"; provider: "twitch"; channel: string; videoId: string }
  | { kind: "iframe"; provider: "vimeo"; videoId: string }
  | { kind: "iframe"; provider: "dailymotion"; videoId: string };

export type MediaSource =
  | { kind: "hls"; url: string; live: boolean }
  | { kind: "file"; url: string }
  | IframeSource
  | { kind: "acestream"; contentId: string; gateway: string };

export type Playback = {
  playing: boolean;
  positionSec: number;
  updatedAt: number;
  revision: number;
  live: boolean;
};

export type ChatMessage = {
  id: number;
  name: string;
  body: string;
  kind: MessageKind;
  at: number;
  self: boolean;
};

export type Viewer = {
  id: string;
  name: string;
  host: boolean;
};

export type RoomSnapshot = {
  code: string;
  title: string;
  matchTitle: string;
  hostName: string;
  access: Access;
  hasPassword: boolean;
  source: MediaSource | null;
  syncMode: SyncMode;
  playback: Playback;
  youAreHost: boolean;
  viewers: Viewer[];
  viewerCount: number;
  messages: ChatMessage[];
};

export type RoomResult =
  | { ok: true; room: RoomSnapshot; secret?: string; adminToken?: string }
  | { ok: false; error: string };

export type BroadcastView = {
  title: string;
  source: MediaSource | null;
  updatedAt: number;
  hasAdmin: boolean;
  code: string;
};

export type PublicRoomCard = {
  code: string;
  title: string;
  matchTitle: string;
  hostName: string;
  viewers: number;
  hasSource: boolean;
  hasPassword: boolean;
  syncMode: SyncMode;
};

export type PeekRoom =
  | { found: false }
  | {
      found: true;
      access: Access;
      needsPassword: boolean;
      title: string;
      matchTitle: string;
    };

export type SourceDraft = {
  kind: "none" | "hls" | "file" | "iframe" | "acestream";
  url: string;
  live: boolean;
  gateway: string;
};

export const REACTIONS = [
  { emoji: "⚽", label: "ГОЛ" },
  { emoji: "🔥", label: "МОМЕНТ" },
  { emoji: "🥅", label: "ШТАНГА" },
  { emoji: "⚪", label: "ПЕНАЛЬТИ" },
  { emoji: "🚩", label: "ОФСАЙД" },
  { emoji: "✨", label: "КЕРЕМЕТ" },
  { emoji: "🧼", label: "СУДЬЮ НА МЫЛО" },
  { emoji: "👏", label: "КРАСАВА" },
  { emoji: "💥", label: "ПУШКА" },
  { emoji: "🎯", label: "В ДЕВЯТКУ" },
  { emoji: "🟨", label: "ЗАСУДИЛИ" },
  { emoji: "🧤", label: "ВРАТАРЬ БОГ" },
  { emoji: "😱", label: "НУ ЧТО ТЫ ТВОРИШЬ" },
  { emoji: "🧱", label: "СТЕНКА" },
] as const;

export function reactionText(reaction: (typeof REACTIONS)[number]): string {
  return `${reaction.emoji} ${reaction.label}`;
}

export const SAMPLE_HLS = {
  url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  label: "Тестовый HLS-ролик (не спортивная трансляция)",
  live: false,
} as const;
