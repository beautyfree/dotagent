import { describe, expect, it } from "bun:test";
import { parseImportDecisions } from "../src/decisions.js";

describe("portable import decisions", () => {
  it("accepts explicit library dispositions", () => {
    expect(
      parseImportDecisions([
        { candidateKey: "local", disposition: "owned" },
        { candidateKey: "upstream", disposition: "dependency" },
        { candidateKey: "copy", disposition: "vendored", license: "MIT" },
        { candidateKey: "private", disposition: "local-only", reason: "Personal notes" },
      ]),
    ).toHaveLength(4);
  });

  it("requires a source license only for explicit vendoring", () => {
    expect(() => parseImportDecisions([{ candidateKey: "copy", disposition: "vendored" }])).toThrow(
      "Vendoring requires the upstream skill license",
    );
    expect(() =>
      parseImportDecisions([{ candidateKey: "upstream", disposition: "dependency", license: "MIT" }]),
    ).toThrow("accepted only for an explicitly vendored skill");
  });

  it("rejects duplicate candidate decisions", () => {
    expect(() =>
      parseImportDecisions([
        { candidateKey: "same", disposition: "owned" },
        { candidateKey: "same", disposition: "excluded" },
      ]),
    ).toThrow("Duplicate import decision");
  });
});
