import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, hashToken, randomCode, tokensMatch, verifyPassword } from "./secrets.server.ts";

describe("room secrets", () => {
  it("issues an unguessable code and checks the host token", () => {
    const code = randomCode();
    assert.match(code, /^[a-z0-9]{8}$/);
    const token = "host-token-example";
    const hash = hashToken(token);
    assert.equal(tokensMatch(token, hash), true);
    assert.equal(tokensMatch("other-person", hash), false);
    assert.equal(tokensMatch("", hash), false);
  });

  it("checks a room password without accepting a blank or a wrong one", () => {
    const stored = hashPassword("ворота");
    assert.equal(verifyPassword("ворота", stored), true);
    assert.equal(verifyPassword("мимо", stored), false);
    assert.equal(verifyPassword("", stored), false);
  });
});
