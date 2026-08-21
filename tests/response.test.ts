import { describe, expect, it } from "vitest";
import { qualifiesForSpeech } from "../src/response.ts";

describe("qualifiesForSpeech", () => {
  it("skips trivial acknowledgements", () => {
    expect(qualifiesForSpeech("Thanks, done!", 4)).toBe(false);
  });

  it("skips code-only and diff-only replies", () => {
    expect(qualifiesForSpeech("```ts\nconst result = 1;\n```", 1)).toBe(false);
    expect(qualifiesForSpeech("diff --git a/a.ts b/a.ts\n+result", 1)).toBe(
      false,
    );
  });

  it("accepts a substantive result with a human action", () => {
    expect(
      qualifiesForSpeech(
        "Implemented the migration and all twelve checks pass. Please review the release note.",
        12,
      ),
    ).toBe(true);
  });
});
