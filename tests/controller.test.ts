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
  explanation = undefined,
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
    modelRegistry: {
      getAll: vi.fn(),
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

  it("keeps narrating newly settled responses instead of replaying the previous one", async () => {
    const { controller, context, enqueue, setResponse } =
      createControllerFixture({
        response:
          "I fixed the first regression and confirmed all twelve checks pass again today. Please restart Pi now.",
      });

    await controller.handleSettled(context);
    setResponse(
      "I fixed the second regression and confirmed all twelve checks still pass after a fresh run. You can keep working.",
    );
    await controller.handleSettled(context);

    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      "I fixed the first regression and confirmed all twelve checks pass again today. Please restart Pi now.",
      expect.any(Object),
    );
    expect(enqueue).toHaveBeenNthCalledWith(
      2,
      "I fixed the second regression and confirmed all twelve checks still pass after a fresh run. You can keep working.",
      expect.any(Object),
    );
  });

  it("uses independent explainer only for speak explain", async () => {
    const { controller, context, explain, enqueue } = createControllerFixture({
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

  it("shows the direct-response help commands without legacy verbs", async () => {
    const { controller, context } = createControllerFixture({
      response: "I changed queue implementation.",
    });

    await controller.handleCommand("help", context);

    expect(context.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining(
        "prev, explain, off, stop, voice <name>, rate <±N%>, config, status, help",
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

  it("shows the direct-response invalid-command list without legacy verbs", async () => {
    const { controller, context } = createControllerFixture({
      response: "I changed queue implementation.",
    });

    await controller.handleCommand("legacy", context);

    expect(context.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining(
        "prev, explain, off, stop, voice <name>, rate <±N%>, config, status, help",
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

  it("uses I and you in explainer instruction", () => {
    expect(EXPLANATION_SYSTEM_PROMPT).toContain("I");
    expect(EXPLANATION_SYSTEM_PROMPT).toContain("you");
    expect(EXPLANATION_SYSTEM_PROMPT).toMatch(/limited prior knowledge/i);
  });
});
