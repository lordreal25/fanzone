import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_HLS } from "./types.ts";
import { aceManifestUrl, iframeSrc, playbackTarget } from "./media.ts";
import {
  canonicalSource,
  cleanName,
  normalizeCode,
  parseCreate,
  parseGateway,
  parseSource,
  sanitizeMessage,
} from "./validate.ts";

const hls = SAMPLE_HLS.url;

describe("room codes and text", () => {
  it("reads a code from a shared link", () => {
    assert.equal(normalizeCode("https://example.com/room/ab12cd34"), "ab12cd34");
    assert.equal(normalizeCode("AB12CD34"), "ab12cd34");
    assert.equal(normalizeCode("not a code"), null);
  });

  it("rejects markup and keeps a normal chat line", () => {
    assert.equal(sanitizeMessage("  гол <script>alert(1)</script> "), "гол alert(1)");
    assert.equal(sanitizeMessage("javascript:alert(1)"), null);
    assert.equal(cleanName("Ай"), "Ай");
    assert.equal(cleanName("<b>"), null);
  });
});

describe("media sources", () => {
  it("accepts a public HLS manifest and rejects internal or blob urls", () => {
    const ok = parseSource({ kind: "hls", url: hls, live: false, gateway: "" });
    assert.equal(ok.ok && ok.source?.kind, "hls");
    assert.equal(parseSource({ kind: "hls", url: "blob:https://evil/uuid", live: false, gateway: "" }).ok, false);
    assert.equal(parseSource({ kind: "hls", url: "https://10.1.2.3/live.m3u8", live: true, gateway: "" }).ok, false);
    assert.equal(parseSource({ kind: "hls", url: "http://cdn.example.com/a.m3u8", live: true, gateway: "" }).ok, false);
    assert.equal(
      parseSource({ kind: "hls", url: "https://user:pass@cdn.example.com/a.m3u8", live: true, gateway: "" }).ok,
      false,
    );
  });

  it("allows only embeddable players", () => {
    const yt = parseSource({
      kind: "iframe",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      live: false,
      gateway: "",
    });
    assert.equal(yt.ok && yt.source && yt.source.kind === "iframe" && yt.source.provider, "youtube");
    assert.equal(parseSource({ kind: "iframe", url: "https://evil.example/player", live: false, gateway: "" }).ok, false);
    if (yt.ok && yt.source && yt.source.kind === "iframe") {
      assert.match(iframeSrc(yt.source, "preview.example"), /youtube-nocookie.com\/embed\/dQw4w9WgXcQ/);
    }
  });

  it("does not invent an Ace Stream playback url without a gateway", () => {
    const id = "a".repeat(40);
    const parsed = parseSource({ kind: "acestream", url: `acestream://${id}`, live: true, gateway: "" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok || !parsed.source) return;
    assert.deepEqual(playbackTarget(parsed.source, { parentHost: "localhost", localGateway: "" }), {
      type: "ace-unconfigured",
      contentId: id,
    });
    assert.equal(aceManifestUrl(id, "http://127.0.0.1:6878"), `http://127.0.0.1:6878/ace/manifest.m3u8?id=${id}`);
    assert.equal(parseGateway("http://192.168.0.8:6878").ok, false);
    assert.equal(parseGateway("http://127.0.0.1:6878").ok, true);
    assert.equal(canonicalSource(parsed.source)?.kind, "acestream");
  });

  it("rejects a room without a name", () => {
    const result = parseCreate({
      title: "Финал",
      matchTitle: "Север — Юг",
      hostName: "А",
      access: "public",
      password: "",
      source: { kind: "none" },
    });
    assert.equal(result.ok, false);
  });
});
