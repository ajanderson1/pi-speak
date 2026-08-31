import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/config.ts";
import { EXPLANATION_SYSTEM_PROMPT } from "../src/summarise.ts";
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

vi.mock("../src/summarise.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/summarise.ts")>();
  return { ...actual, summarise: mocks.explain };
});

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

function createControllerFixture({
  response,
  explanation,
}: {
  response: string;
  explanation?: string;
}) {
  let currentResponse = response;
  const load = mocks.load.mockResolvedValue({
    ...DEFAULT_SETTINGS,
    enabled: true,
  });
  const save = mocks.save.mockResolvedValue({
    ...DEFAULT_SETTINGS,
    enabled: true,
  });
  const explain = mocks.explain.mockResolvedValue(explanation);
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
            content: [{ type: "text", text: currentResponse }],
          },
        },
      ],
    },
    ui: {
      notify: vi.fn(),
      select: vi.fn(),
    },
    scopedModels: [],
    modelRegistry: {
      getAll: vi.fn(),
      getAvailable: vi.fn(() => []),
      find: vi.fn(),
      getApiKeyAndHeaders: vi.fn(),
    },
  } as unknown as ExtensionContext;

  return {
    controller,
    context,
    enqueue,
    explain,
    setResponse: (next: string) => {
      currentResponse = next;
    },
  };
}

describe("SpeakController", () => {
  it("summarises a settled assistant response through the explainer by default", async () => {
    const { controller, context, enqueue, explain } = createControllerFixture({
      response:
        "I implemented the migration and twelve checks pass. Please review the release note.",
      explanation:
        "TLDR: the migration is done. I implemented the migration, all twelve checks pass, and you should review the release note.",
    });

    await controller.handleSettled(context);

    expect(explain).toHaveBeenCalledWith(
      expect.objectContaining({ modelRegistry: context.modelRegistry }),
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      "I implemented the migration and twelve checks pass. Please review the release note.",
      expect.any(AbortSignal),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.stringContaining("TLDR"),
      expect.objectContaining({ voice: "en-GB-SoniaNeural", rate: "+5%" }),
    );
  });

  it("does not narrate when a settled response is too short to qualify", async () => {
    const { controller, context, enqueue, explain } = createControllerFixture({
      response: "Done.",
    });

    await controller.handleSettled(context);

    expect(explain).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("replays the latest response through the explainer for speak prev", async () => {
    const { controller, context, enqueue, explain } = createControllerFixture({
      response: "I fixed the regression. You can restart Pi now.",
      explanation: "I fixed the regression, so you can restart Pi now.",
    });

    await controller.handleCommand("prev", context);

    expect(explain).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("treats speak explain as an alias for speak prev", async () => {
    const { controller, context, enqueue, explain } = createControllerFixture({
      response: "I changed queue implementation.",
      explanation:
        "I changed how I schedule spoken messages, so you will hear only the newest answer.",
    });

    await controller.handleCommand("explain", context);

    expect(explain).toHaveBeenCalledWith(
      expect.objectContaining({ modelRegistry: context.modelRegistry }),
      { provider: "openai-codex", id: "gpt-5.4-mini" },
      "I changed queue implementation.",
      expect.any(AbortSignal),
    );
    expect(enqueue).toHaveBeenCalledWith(
      "I changed how I schedule spoken messages, so you will hear only the newest answer.",
      expect.any(Object),
    );
  });

  it("keeps narrating newly settled responses instead of replaying the previous one", async () => {
    const { controller, context, enqueue, setResponse, explain } =
      createControllerFixture({
        response:
          "I fixed the first regression and confirmed all twelve checks pass again today. Please restart Pi now.",
        explanation: "First response explained.",
      });

    await controller.handleSettled(context);
    explain.mockResolvedValueOnce("Second response explained.");
    setResponse(
      "I fixed the second regression and confirmed all twelve checks still pass after a fresh run. You can keep working.",
    );
    await controller.handleSettled(context);

    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      "First response explained.",
      expect.any(Object),
    );
    expect(enqueue).toHaveBeenNthCalledWith(
      2,
      "Second response explained.",
      expect.any(Object),
    );
  });

  it("notifies when the explainer rejects during speak prev", async () => {
    const { controller, context, explain } = createControllerFixture({
      response: "I changed queue implementation.",
    });
    explain.mockRejectedValueOnce(new Error("boom"));

    await controller.handleCommand("prev", context);

    expect(context.ui.notify).toHaveBeenCalledWith(
      "Explanation generation failed.",
      "info",
    );
  });

  it("shows the default help commands", async () => {
    const { controller, context } = createControllerFixture({
      response: "I changed queue implementation.",
    });

    await controller.handleCommand("help", context);

    expect(context.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining(
        "prev, off, stop, voice <name>, rate <±N%>, config, status, help",
      ),
      "info",
    );
    expect(context.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining("that"),
      "info",
    );
    expect(context.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining("resummarise"),
      "info",
    );
  });

  it("shows the same command list for an invalid command", async () => {
    const { controller, context } = createControllerFixture({
      response: "I changed queue implementation.",
    });

    await controller.handleCommand("legacy", context);

    expect(context.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining(
        "prev, off, stop, voice <name>, rate <±N%>, config, status, help",
      ),
      "info",
    );
  });

  it("starts with a TLDR instruction and strips markdown, tables, and full paths", () => {
    expect(EXPLANATION_SYSTEM_PROMPT).toMatch(/TLDR/);
    expect(EXPLANATION_SYSTEM_PROMPT).toMatch(/markdown/i);
    expect(EXPLANATION_SYSTEM_PROMPT).toMatch(/table/i);
    expect(EXPLANATION_SYSTEM_PROMPT).toContain(
      "speak only its file name, never its directory path",
    );
  });
});
