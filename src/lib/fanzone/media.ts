import type { MediaSource } from "./types.ts";

export type PlaybackTarget =
  | { type: "empty" }
  | { type: "ace-unconfigured"; contentId: string }
  | { type: "iframe"; url: string }
  | { type: "video"; url: string; hls: boolean };

function safeHost(parentHost: string): string {
  const host = parentHost.trim().toLowerCase().replace(/:\d+$/, "");
  if (!/^[a-z0-9.-]+$/.test(host)) return "localhost";
  return host;
}

export function aceManifestUrl(contentId: string, gateway: string): string | null {
  const base = gateway.trim().replace(/\/$/, "");
  if (!base || !/^[a-f0-9]{40}$/.test(contentId)) return null;
  return `${base}/ace/manifest.m3u8?id=${contentId}`;
}

export function playbackTarget(
  source: MediaSource | null,
  opts: { parentHost: string; localGateway: string },
): PlaybackTarget {
  if (!source) return { type: "empty" };
  if (source.kind === "hls") return { type: "video", url: source.url, hls: true };
  if (source.kind === "file") return { type: "video", url: source.url, hls: false };
  if (source.kind === "acestream") {
    const gateway = source.gateway || opts.localGateway;
    const url = aceManifestUrl(source.contentId, gateway);
    if (!url) return { type: "ace-unconfigured", contentId: source.contentId };
    return { type: "video", url, hls: true };
  }
  return { type: "iframe", url: iframeSrc(source, opts.parentHost) };
}

export function iframeSrc(source: Extract<MediaSource, { kind: "iframe" }>, parentHost: string): string {
  const parent = safeHost(parentHost);
  if (source.provider === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${source.videoId}?rel=0`;
  }
  if (source.provider === "vimeo") return `https://player.vimeo.com/video/${source.videoId}`;
  if (source.provider === "dailymotion") {
    return `https://www.dailymotion.com/embed/video/${source.videoId}`;
  }
  if (source.channel) {
    return `https://player.twitch.tv/?channel=${encodeURIComponent(source.channel)}&parent=${encodeURIComponent(parent)}`;
  }
  return `https://player.twitch.tv/?video=${encodeURIComponent(source.videoId)}&parent=${encodeURIComponent(parent)}`;
}

export function sourceLabel(source: MediaSource | null): string {
  if (!source) return "Источник не добавлен";
  if (source.kind === "hls") return source.live ? "HLS · прямой эфир" : "HLS · запись";
  if (source.kind === "file") return "Видеофайл";
  if (source.kind === "acestream") return "Ace Stream";
  if (source.provider === "youtube") return "YouTube";
  if (source.provider === "twitch") return "Twitch";
  if (source.provider === "vimeo") return "Vimeo";
  return "Dailymotion";
}
