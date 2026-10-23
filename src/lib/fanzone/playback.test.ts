import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSyncTimeline, expectedPosition, shouldSeek } from "./playback.ts";

describe("playback sync", () => {
  it("advances a playing anchor and holds a pause", () => {
    assert.equal(expectedPosition({ playing: true, positionSec: 10, localAt: 1_000 }, 6_000), 15);
    assert.equal(expectedPosition({ playing: false, positionSec: 10, localAt: 1_000 }, 9_000), 10);
  });

  it("seeks only when drift is visible", () => {
    assert.equal(shouldSeek(10, 12), false);
    assert.equal(shouldSeek(10, 13), true);
  });

  it("does not pretend a live or embedded source shares one timeline", () => {
    assert.equal(canSyncTimeline({ kind: "hls", url: "https://cdn.example/a.m3u8", live: true }), false);
    assert.equal(canSyncTimeline({ kind: "hls", url: "https://cdn.example/a.m3u8", live: false }), true);
    assert.equal(canSyncTimeline({ kind: "iframe", provider: "youtube", videoId: "dQw4w9WgXcQ" }), false);
    assert.equal(canSyncTimeline({ kind: "file", url: "https://cdn.example/a.mp4" }), true);
  });
});
