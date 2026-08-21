import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSettings, saveSettings } from "../src/config.ts";

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("Pi Speak settings", () => {
  it("persists settings independently per working directory", async () => {
    directory = await mkdtemp(join(tmpdir(), "pi-speak-"));
    const options = { configDirectory: directory };

    await saveSettings("/repo-a", { enabled: true, rate: "+10%" }, options);

    expect(await loadSettings("/repo-a", options)).toMatchObject({
      enabled: true,
      rate: "+10%",
    });
    expect(await loadSettings("/repo-b", options)).toMatchObject({
      enabled: false,
      rate: "+5%",
    });
  });
});
