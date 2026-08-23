import { describe, expect, it } from "vitest";
import { normaliseForSpeech } from "../src/normalise.ts";

describe("normaliseForSpeech", () => {
  it("retains formatted technical text while stripping its special characters", () => {
    const spoken = normaliseForSpeech(
      "Read **`src/controller.ts`** at https://github.com/ajanderson1/pi-speak.\n```ts\nconst result = user_id;\n```",
    );

    expect(spoken).toMatch(/src controller ts/i);
    expect(spoken).toMatch(/https github com ajanderson1 pi speak/i);
    expect(spoken).toMatch(/const result user id/i);
    expect(spoken).not.toContain("project file");
    expect(spoken).not.toMatch(/[`/_=]/u);
  });

  it("retains identifiers from fenced code", () => {
    const spoken = normaliseForSpeech(
      "```ts\nfunction greet(name) { return name; }\n```",
    );

    expect(spoken).toMatch(/function greet name/i);
    expect(spoken).toMatch(/return name/i);
    expect(spoken).not.toMatch(/[`{}()]/u);
  });

  it("never speaks the legacy generic file substitution", () => {
    expect(normaliseForSpeech("Read `src/index.ts` in the project file.")).toBe(
      "Read src index ts in.",
    );
  });

  it("expands common acronyms and percentages", () => {
    expect(normaliseForSpeech("The API returned 20% faster.")).toBe(
      "The application programming interface returned twenty percent faster.",
    );
  });
});
