import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config.ts";
import { SpeakController } from "../src/controller.ts";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  explain: vi.fn(),
  enqueue: vi.fn(),
  stop: vi.fn(),
  pauseOrResume: vi.fn(),
}));

vi.mock("../src/config.ts", () => ({
  DEFAULT_SETTINGS: {
    enabled: false,
    voice: "en-GB-SoniaNeural",
    rate: "+5%",
    minimumWords: 12,
    model: { provider: "openai-codex", id: "gpt-5.4-mini" },
  },
  loadSettings: mocks.load,
  saveSettings: mocks.save,
}));

vi.mock("../src/summarise.ts", () => ({
  summarise: mocks.explain,
}));

vi.mock("../src/audio.ts", () => ({
  AudioQueue: vi.fn(() => ({
    enqueue: mocks.enqueue,
    stop: mocks.stop,
    pauseOrResume: mocks.pauseOrResume,
  })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function createControllerFixture({ response }: { response: string }) {
  const load = mocks.load.mockResolvedValue({
    ...DEFAULT_SETTINGS,
    enabled: true,
  });
  const save = mocks.save.mockResolvedValue({
    ...DEFAULT_SETTINGS,
    enabled: true,
  });
  const explain = mocks.explain.mockResolvedValue(undefined);
  const enqueue = mocks.enqueue;

  const controller = new SpeakController({
    audio: {
      enqueue,
      stop: mocks.stop,
      pauseOrResume: mocks.pauseOrResume,
    },
    load,
    save,
    explain,
  } as never);

  const context = {
    cwd: "/repo",
    sessionManager: {
      getBranch: () => [
        {
          type: "message",
          message: {
            role: "assistant",
            content: [{ type: "text", text: response }],
          },
        },
      ],
    },
    ui: {
      notify: vi.fn(),
      select: vi.fn(),
    },
    modelRegistry: {
      getAll: vi.fn(),
      find: vi.fn(),
      getApiKeyAndHeaders: vi.fn(),
    },
  } as unknown as ExtensionContext;

  return { controller, context, enqueue, explain };
}

describe("SpeakController", () => {
  it("narrates a settled assistant response without calling the explainer", async () => {
    const { controller, context, enqueue, explain } = createControllerFixture({
      response:
        "I implemented the migration and twelve checks pass. Please review the release note.",
    });

    await controller.handleSettled(context);

    expect(explain).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      "I implemented the migration and twelve checks pass. Please review the release note.",
      expect.objectContaining({ voice: "en-GB-SoniaNeural", rate: "+5%" }),
    );
  });

  it("speaks the latest response for speak prev without calling the explainer", async () => {
    const { controller, context, enqueue, explain } = createControllerFixture({
      response: "I fixed the regression. You can restart Pi now.",
    });

    await controller.handleCommand("prev", context);

    expect(explain).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
