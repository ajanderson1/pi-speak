import { describe, expect, it } from "vitest";
import { normaliseForSpeech } from "../src/normalise.ts";

describe("normaliseForSpeech", () => {
  it("removes code and paths while expanding money and units", () => {
    expect(
      normaliseForSpeech("Fixed `src/foo_bar.ts`; saved $42.50 in 8GB."),
    ).toBe(
      "Fixed the project file. Saved forty-two dollars fifty in eight gigabytes.",
    );
  });

  it("removes URLs and commit hashes", () => {
    const text = normaliseForSpeech(
      "See https://example.test/a and commit a1b2c3d4.",
    );

    expect(text).not.toMatch(/https|a1b2c3d4/);
  });

  it("expands common acronyms and percentages", () => {
    expect(normaliseForSpeech("The API returned 20% faster.")).toBe(
      "The application programming interface returned twenty percent faster.",
    );
  });
});
