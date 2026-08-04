import { describe, expect, test } from "bun:test";
import { exactSourceSecurityPolicy } from "../src/source-policy.js";
import {
  fetchWellKnownIndex,
  planWellKnownIndexRequest,
  type WellKnownHttpPort,
  type WellKnownResponse,
} from "../src/well-known.js";

function response(body: string, status = 200, headers: Record<string, string> = {}): WellKnownResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    async text() {
      return body;
    },
  };
}

describe("well-known HTTPS source review", () => {
  test("rejects an untrusted index before the HTTP port runs", async () => {
    let requests = 0;
    const port: WellKnownHttpPort = {
      async fetch() {
        requests += 1;
        return response("{}");
      },
    };
    expect(() => planWellKnownIndexRequest("https://example.com/.well-known/dotagents.json", {})).toThrow(
      /blocked|trust/i,
    );
    expect(requests).toBe(0);
    void port;
  });

  test("reviews every entry without allowing an index author to grant source trust", async () => {
    const indexUrl = "https://example.com/.well-known/dotagents.json";
    const trustedManifest = "https://example.com/libraries/team/skills.json";
    const policy = exactSourceSecurityPolicy([indexUrl, trustedManifest]);
    const plan = planWellKnownIndexRequest(indexUrl, policy);
    const body = JSON.stringify({
      schema_version: 1,
      libraries: [
        { id: "trusted", manifest_url: trustedManifest, sha256: "a".repeat(64) },
        { id: "blocked", manifest_url: "https://attacker.invalid/skills.json" },
      ],
    });
    let reviewedInit: unknown;
    const port: WellKnownHttpPort = {
      async fetch(_url, init) {
        reviewedInit = init;
        return response(body, 200, { "content-length": String(Buffer.byteLength(body)) });
      },
    };
    const review = await fetchWellKnownIndex(plan, plan.planId, { port });
    expect(review.libraries.find((entry) => entry.id === "trusted")?.trust).not.toBeNull();
    expect(review.libraries.find((entry) => entry.id === "blocked")).toMatchObject({
      trust: null,
      blockedReason: "source-not-trusted",
    });
    expect(reviewedInit).toMatchObject({ redirect: "error", headers: { accept: "application/json" } });
  });

  test("binds index bytes to the review and enforces response size", async () => {
    const indexUrl = "https://example.com/.well-known/dotagents.json";
    const policy = exactSourceSecurityPolicy([indexUrl]);
    const plan = planWellKnownIndexRequest(indexUrl, policy);
    const port = (body: string): WellKnownHttpPort => ({
      async fetch() {
        return response(body);
      },
    });
    const empty = JSON.stringify({ schema_version: 1, libraries: [] });
    const one = JSON.stringify({
      schema_version: 1,
      libraries: [{ id: "one", manifest_url: "https://untrusted.invalid/skills.json" }],
    });
    const first = await fetchWellKnownIndex(plan, plan.planId, { port: port(empty) });
    const changed = await fetchWellKnownIndex(plan, plan.planId, { port: port(one) });
    expect(changed.indexIntegrity).not.toBe(first.indexIntegrity);
    expect(changed.planId).not.toBe(first.planId);
    await expect(fetchWellKnownIndex(plan, plan.planId, { port: port(one), maximumBytes: 10 })).rejects.toThrow(
      /exceeds/i,
    );
  });
});
