import { describe, expect, it, vi } from "vitest";
import extension from "../src/index.ts";

describe("pi-speak extension", () => {
  it("registers the speak command", () => {
    const registerCommand = vi.fn();

    extension({
      registerCommand,
      on: vi.fn(),
      registerShortcut: vi.fn(),
    } as never);

    expect(registerCommand).toHaveBeenCalledWith("speak", expect.any(Object));
  });
});
