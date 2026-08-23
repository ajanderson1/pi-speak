import { describe, expect, it, vi } from "vitest";
import extension from "../src/index.ts";

describe("pi-speak extension", () => {
  it("describes the direct-response speak command", () => {
    const registerCommand = vi.fn();

    extension({
      registerCommand,
      on: vi.fn(),
      registerShortcut: vi.fn(),
    } as never);

    const command = registerCommand.mock.calls.find(
      ([name]) => name === "speak",
    )?.[1];
    expect(command.description).toContain("responses");
    expect(command.description).not.toContain("summaries");
  });
});
