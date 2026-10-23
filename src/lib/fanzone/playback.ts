import type { MediaSource, Playback } from "./types.ts";

export const SEEK_DRIFT_SEC = 2.5;

export function expectedPosition(
  anchor: { playing: boolean; positionSec: number; localAt: number },
  now: number,
): number {
  if (!anchor.playing) return Math.max(0, anchor.positionSec);
  const delta = Math.max(0, now - anchor.localAt) / 1000;
  return anchor.positionSec + delta;
}

export function shouldSeek(localSec: number, expectedSec: number): boolean {
  return Math.abs(localSec - expectedSec) > SEEK_DRIFT_SEC;
}

/** Live feeds and embedded players cannot share one timeline. */
export function canSyncTimeline(source: MediaSource | null): boolean {
  if (!source) return false;
  if (source.kind === "file") return true;
  if (source.kind === "hls") return !source.live;
  return false;
}

export function emptyPlayback(revision = 1): Playback {
  return { playing: false, positionSec: 0, updatedAt: Date.now(), revision, live: false };
}
