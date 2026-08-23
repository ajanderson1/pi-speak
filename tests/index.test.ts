import { describe, expect, it, vi } from "vitest";
import extension from "../src/index.ts";

describe("pi-speak extension", () => {
  it("registers the direct-response speak command without a shortcut", () => {
    const registerCommand = vi.fn();
    const registerShortcut = vi.fn();

    extension({
      registerCommand,
      on: vi.fn(),
      registerShortcut,
    } as never);

    const command = registerCommand.mock.calls.find(
      ([name]) => name === "speak",
    )?.[1];
    expect(command.description).toContain("responses");
    expect(command.description).not.toContain("summaries");
    expect(registerShortcut).not.toHaveBeenCalled();
  });
});
