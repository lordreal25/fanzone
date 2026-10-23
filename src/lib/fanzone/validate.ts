import type { Access, MediaSource, SourceDraft, SyncMode } from "./types.ts";
import { REACTIONS, reactionText } from "./types.ts";

const CODE = /^[a-z0-9]{8}$/;
const CLIENT = /^[a-zA-Z0-9_-]{8,64}$/;
const ACE_ID = /^[a-f0-9]{40}$/;
const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const TWITCH_CHANNEL = /^[A-Za-z0-9_]{2,25}$/;
const TWITCH_VIDEO = /^[0-9]{6,12}$/;
const VIMEO_ID = /^[0-9]{6,12}$/;
const DM_ID = /^[A-Za-z0-9]{4,12}$/;

export function stripUnsafe(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanName(input: string): string | null {
  const value = stripUnsafe(input);
  if (value.length < 2 || value.length > 24) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'’-]*$/u.test(value)) return null;
  return value;
}

export function cleanTitle(input: string, max: number): string | null {
  const value = stripUnsafe(input);
  if (value.length < 1 || value.length > max) return null;
  return value;
}

export function sanitizeMessage(input: string): string | null {
  const stripped = stripUnsafe(input).replace(/<[^>]*>/g, "");
  if (!stripped || stripped.length > 400) return null;
  if (/javascript:/i.test(stripped)) return null;
  return stripped;
}

export function normalizeCode(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  const fromPath = text.match(/(?:^|\/)room\/([a-z0-9]{8})(?:[/?#]|$)/);
  if (fromPath?.[1]) return fromPath[1];
  return CODE.test(text) ? text : null;
}

export function validClientId(value: string): boolean {
  return CLIENT.test(value);
}

function hostnameOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/** Block targets that must never be stored as a shared remote stream. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "metadata.google.internal" ||
    h === "metadata.google" ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  if (h.includes(":")) {
    return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = [v4[1], v4[2], v4[3], v4[4]].map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  return false;
}

function isLoopback(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "::1";
}

function readHttpUrl(raw: string): URL | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "Некорректная ссылка." };
  }
  if (url.username || url.password) return { error: "Ссылка с логином и паролем не принимается." };
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "Нужна ссылка http или https. Ссылки blob: и file: не воспроизводятся." };
  }
  return url;
}

function assertPublicHttps(url: URL): string | null {
  if (url.protocol !== "https:") return "Удалённый источник должен открываться по HTTPS.";
  const host = hostnameOf(url);
  if (!host || isBlockedHost(host) || isIpLiteral(host) && isBlockedHost(host)) {
    return "Внутренние и локальные адреса нельзя использовать как общий источник.";
  }
  if (isBlockedHost(host)) return "Этот адрес источника запрещён.";
  return null;
}

function youtubeId(url: URL): string | null {
  const host = hostnameOf(url).replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YT_ID.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v") ?? "";
    return YT_ID.test(id) ? id : null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed" || parts[0] === "live" || parts[0] === "shorts") {
    const id = parts[1] ?? "";
    return YT_ID.test(id) ? id : null;
  }
  return null;
}

function twitchSource(url: URL): MediaSource | null {
  const host = hostnameOf(url).replace(/^www\./, "");
  if (host === "player.twitch.tv") {
    const channel = url.searchParams.get("channel") ?? "";
    const video = (url.searchParams.get("video") ?? "").replace(/^v/, "");
    if (TWITCH_CHANNEL.test(channel)) return { kind: "iframe", provider: "twitch", channel, videoId: "" };
    if (TWITCH_VIDEO.test(video)) return { kind: "iframe", provider: "twitch", channel: "", videoId: video };
    return null;
  }
  if (host !== "twitch.tv") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "videos" && parts[1] && TWITCH_VIDEO.test(parts[1])) {
    return { kind: "iframe", provider: "twitch", channel: "", videoId: parts[1] };
  }
  if (parts[0] && TWITCH_CHANNEL.test(parts[0]) && parts[0] !== "directory") {
    return { kind: "iframe", provider: "twitch", channel: parts[0], videoId: "" };
  }
  return null;
}

function vimeoId(url: URL): string | null {
  const host = hostnameOf(url).replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[0] === "video" ? parts[1] : parts[0];
  return id && VIMEO_ID.test(id) ? id : null;
}

function dailymotionId(url: URL): string | null {
  const host = hostnameOf(url).replace(/^www\./, "");
  if (host !== "dailymotion.com" && host !== "dai.ly") return null;
  if (host === "dai.ly") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return DM_ID.test(id) ? id : null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts[0] === "embed" ? 2 : 1;
  const id = parts[0] === "video" || parts[0] === "embed" ? (parts[idx] ?? parts[1] ?? "") : "";
  return DM_ID.test(id) ? id : null;
}

export function parseGateway(raw: string): { ok: true; gateway: string } | { ok: false; error: string } {
  const value = raw.trim().replace(/\/$/, "");
  if (!value) return { ok: true, gateway: "" };
  const parsed = readHttpUrl(value);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const host = hostnameOf(parsed);
  if (isLoopback(host)) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Локальный шлюз Ace Stream указывается как http://127.0.0.1:6878." };
    }
    return { ok: true, gateway: parsed.origin };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Общий шлюз Ace Stream должен быть HTTPS. Локальный движок — только 127.0.0.1." };
  }
  if (isBlockedHost(host)) return { ok: false, error: "Этот адрес шлюза запрещён." };
  return { ok: true, gateway: parsed.origin };
}

export function parseSource(draft: SourceDraft): { ok: true; source: MediaSource | null } | { ok: false; error: string } {
  if (draft.kind === "none" || (!draft.url.trim() && draft.kind !== "acestream")) {
    if (draft.kind === "none") return { ok: true, source: null };
    if (!draft.url.trim()) return { ok: false, error: "Укажите ссылку источника или оставьте комнату без трансляции." };
  }

  if (draft.kind === "acestream") {
    const raw = draft.url.trim().toLowerCase().replace(/^acestream:\/\//, "");
    if (!ACE_ID.test(raw)) {
      return { ok: false, error: "Нужен идентификатор Ace Stream: 40 шестнадцатеричных символов." };
    }
    const gateway = parseGateway(draft.gateway);
    if (!gateway.ok) return gateway;
    return { ok: true, source: { kind: "acestream", contentId: raw, gateway: gateway.gateway } };
  }

  const parsed = readHttpUrl(draft.url);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  if (parsed.protocol === "http:") {
    return { ok: false, error: "Для общего просмотра нужен HTTPS-источник." };
  }
  const blocked = assertPublicHttps(parsed);
  if (blocked) return { ok: false, error: blocked };

  if (draft.kind === "hls") {
    if (!parsed.href.toLowerCase().includes("m3u8")) {
      return { ok: false, error: "HLS-ссылка должна вести на манифест .m3u8." };
    }
    return { ok: true, source: { kind: "hls", url: parsed.href, live: draft.live } };
  }

  if (draft.kind === "file") {
    const path = parsed.pathname.toLowerCase();
    if (!path.endsWith(".mp4") && !path.endsWith(".webm") && !path.endsWith(".ogg")) {
      return { ok: false, error: "Файл должен быть MP4, WebM или OGG." };
    }
    return { ok: true, source: { kind: "file", url: parsed.href } };
  }

  const youtube = youtubeId(parsed);
  if (youtube) return { ok: true, source: { kind: "iframe", provider: "youtube", videoId: youtube } };
  const twitch = twitchSource(parsed);
  if (twitch) return { ok: true, source: twitch };
  const vimeo = vimeoId(parsed);
  if (vimeo) return { ok: true, source: { kind: "iframe", provider: "vimeo", videoId: vimeo } };
  const dm = dailymotionId(parsed);
  if (dm) return { ok: true, source: { kind: "iframe", provider: "dailymotion", videoId: dm } };
  return {
    ok: false,
    error: "Внешний плеер можно встроить только с YouTube, Twitch, Vimeo или Dailymotion.",
  };
}

export function isMediaSource(value: unknown): value is MediaSource {
  if (!value || typeof value !== "object") return false;
  const draft = sourceToDraft(value);
  if (!draft) return false;
  const parsed = parseSource(draft);
  return parsed.ok && parsed.source !== null;
}

export function sourceToDraft(value: unknown): SourceDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.kind === "hls" && typeof row.url === "string") {
    return { kind: "hls", url: row.url, live: row.live === true, gateway: "" };
  }
  if (row.kind === "file" && typeof row.url === "string") {
    return { kind: "file", url: row.url, live: false, gateway: "" };
  }
  if (row.kind === "acestream" && typeof row.contentId === "string") {
    return {
      kind: "acestream",
      url: row.contentId,
      live: true,
      gateway: typeof row.gateway === "string" ? row.gateway : "",
    };
  }
  if (row.kind === "iframe" && typeof row.provider === "string" && typeof row.videoId === "string") {
    if (row.provider === "youtube") return { kind: "iframe", url: `https://www.youtube.com/watch?v=${row.videoId}`, live: false, gateway: "" };
    if (row.provider === "vimeo") return { kind: "iframe", url: `https://vimeo.com/${row.videoId}`, live: false, gateway: "" };
    if (row.provider === "dailymotion") {
      return { kind: "iframe", url: `https://www.dailymotion.com/video/${row.videoId}`, live: false, gateway: "" };
    }
    if (row.provider === "twitch") {
      const channel = typeof row.channel === "string" ? row.channel : "";
      const url = channel
        ? `https://www.twitch.tv/${channel}`
        : `https://www.twitch.tv/videos/${row.videoId}`;
      return { kind: "iframe", url, live: false, gateway: "" };
    }
  }
  return null;
}

export function canonicalSource(value: unknown): MediaSource | null {
  const draft = sourceToDraft(value);
  if (!draft) return null;
  const parsed = parseSource(draft);
  if (!parsed.ok || !parsed.source) return null;
  return parsed.source;
}

export type CreateFields = {
  title: string;
  matchTitle: string;
  hostName: string;
  access: Access;
  password: string;
  source: MediaSource | null;
};

export function parseCreate(input: unknown): { ok: true; value: CreateFields } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Некорректные данные комнаты." };
  const row = input as Record<string, unknown>;
  const title = cleanTitle(String(row.title ?? ""), 80);
  const matchTitle = cleanTitle(String(row.matchTitle ?? ""), 120);
  const hostName = cleanName(String(row.hostName ?? ""));
  if (!title) return { ok: false, error: "Название комнаты: от 1 до 80 символов." };
  if (!matchTitle) return { ok: false, error: "Название матча: от 1 до 120 символов." };
  if (!hostName) return { ok: false, error: "Имя: 2–24 символа, без спецсимволов." };
  const access: Access = row.access === "private" ? "private" : row.access === "public" ? "public" : "public";
  if (row.access !== "public" && row.access !== "private") {
    return { ok: false, error: "Выберите публичный или приватный доступ." };
  }
  const password = String(row.password ?? "").trim();
  if (password.length > 72) return { ok: false, error: "Пароль слишком длинный." };
  const sourceInput = row.source;
  let source: MediaSource | null = null;
  if (sourceInput && typeof sourceInput === "object") {
    const draft = sourceInput as SourceDraft;
    if (draft.kind && draft.kind !== "none") {
      const parsed = parseSource({
        kind: draft.kind,
        url: String(draft.url ?? ""),
        live: draft.live === true,
        gateway: String(draft.gateway ?? ""),
      });
      if (!parsed.ok) return parsed;
      source = parsed.source;
    }
  }
  return { ok: true, value: { title, matchTitle, hostName, access, password, source } };
}

export function parseSyncMode(value: unknown): SyncMode | null {
  return value === "sync" || value === "free" ? value : null;
}

export function parseReaction(value: string): string | null {
  const text = value.trim();
  const found = REACTIONS.find((item) => reactionText(item) === text || item.label === text);
  return found ? reactionText(found) : null;
}

export function playbackPosition(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 60 * 60 * 12) return null;
  return Math.round(n * 10) / 10;
}
