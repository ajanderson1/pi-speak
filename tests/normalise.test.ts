import { describe, expect, it } from "vitest";
import { normaliseForSpeech } from "../src/normalise.ts";

describe("normaliseForSpeech", () => {
  it("retains formatted technical text while stripping its special characters", () => {
    const spoken = normaliseForSpeech(
      "Read **`src/controller.ts`** at https://github.com/ajanderson1/pi-speak.\n```ts\nconst result = user_id;\n```",
    );

    expect(spoken).toMatch(/src slash controller dot ts/i);
    expect(spoken).toMatch(
      /https slash slash github dot com slash ajanderson1 slash pi speak/i,
    );
    expect(spoken).toMatch(/const result equals user underscore id/i);
    expect(spoken).not.toContain("project file");
    expect(spoken).not.toMatch(/[`/_=]/u);
  });

  it("retains identifiers from fenced code", () => {
    const spoken = normaliseForSpeech(
      "```ts\nfunction greet(name) { return name; }\n```",
    );

    expect(spoken).toMatch(/function greet open parenthesis name/i);
    expect(spoken).toMatch(/return name/i);
    expect(spoken).not.toMatch(/[`{}()]/u);
  });

  it("speaks technical separators and operators", () => {
    const spoken = normaliseForSpeech(
      "Open `src/utils/foo-bar.ts` at https://api.example.com:8080/#v1. `value => next === result`.",
    );

    expect(spoken).toMatch(/src slash utils slash foo bar dot ts/i);
    expect(spoken).toMatch(
      /https slash slash api dot example dot com 8080 slash hash v1/i,
    );
    expect(spoken).toMatch(/value maps to next strictly equals result/i);
  });

  it("treats dashes and colons as silent separators", () => {
    expect(normaliseForSpeech("Read `foo-bar:baz`.")).toBe("Read foo bar baz.");
  });

  it("retains every sentence in a response", () => {
    const spoken = normaliseForSpeech(
      "One complete sentence. Two complete sentence. Three complete sentence. Four complete sentence.",
    );

    expect(spoken).toContain("Four complete sentence.");
  });

  it("never speaks the legacy generic file substitution", () => {
    expect(normaliseForSpeech("Read `src/index.ts` in the project file.")).toBe(
      "Read src slash index dot ts in.",
    );
  });

  it("expands common acronyms and percentages", () => {
    expect(normaliseForSpeech("The API returned 20% faster.")).toBe(
      "The application programming interface returned twenty percent faster.",
    );
  });
});
