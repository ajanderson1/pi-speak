import { describe, expect, it } from "vitest";
import { normaliseForSpeech } from "../src/normalise.ts";

describe("normaliseForSpeech", () => {
  it("reads a file name only, dropping its directory path", () => {
    expect(
      normaliseForSpeech("Fixed `src/foo_bar.ts`; saved $42.50 in 8GB."),
    ).toBe(
      "Fixed foo_bar.ts. Saved forty-two dollars fifty in eight gigabytes.",
    );
  });

  it("strips a directory path from a bare (non-backticked) file reference", () => {
    expect(
      normaliseForSpeech("Updated src/components/Button.tsx for the fix."),
    ).toBe("Updated Button.tsx for the fix.");
  });

  it("replaces markdown headers, bullets, and emphasis with plain prose", () => {
    const text = normaliseForSpeech(
      "# Summary\n- First point\n- Second point\n**Bold** and _also italic_.",
    );
    expect(text).not.toMatch(/[#*_-]/);
    expect(text).toContain("Summary");
    expect(text).toContain("First point");
    expect(text).toContain("Bold");
  });

  it("summarises a leaked markdown table into spoken prose instead of reading pipes", () => {
    const text = normaliseForSpeech(
      "Results:\n| Name | Status |\n|------|--------|\n| a.ts | pass |\n| b.ts | fail |",
    );
    expect(text).not.toContain("|");
    expect(text).not.toContain("---");
    expect(text?.toLowerCase()).toContain("a.ts");
    expect(text?.toLowerCase()).toContain("pass");
  });

  it("drops fenced code blocks and commit hashes instead of reading them", () => {
    const text = normaliseForSpeech(
      "Done: d621542 is installed.\n```ts\nconst result = 1;\n```\nAll good.",
    );
    expect(text).not.toMatch(/d621542/);
    expect(text).not.toMatch(/const result/);
    expect(text).toContain("All good");
  });

  it("removes URLs", () => {
    const text = normaliseForSpeech("See https://example.test/a for details.");

    expect(text).not.toMatch(/https/);
  });

  it("expands common acronyms and percentages", () => {
    expect(normaliseForSpeech("The API returned 20% faster.")).toBe(
      "The application programming interface returned twenty percent faster.",
    );
  });

  it("retains every sentence in a response", () => {
    const text = normaliseForSpeech(
      "One complete sentence. Two complete sentence. Three complete sentence. Four complete sentence.",
    );

    expect(text).toContain("Four complete sentence.");
  });
});
