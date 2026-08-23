import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { AudioQueue } from "./audio.ts";
import { loadSettings, saveSettings, type SpeakSettings } from "./config.ts";
import { normaliseForSpeech } from "./normalise.ts";
import { qualifiesForSpeech } from "./response.ts";
import { redactForExternalUse } from "./safety.ts";
import { summarise } from "./summarise.ts";

export interface SpeakControllerDependencies {
  readonly audio?: Pick<AudioQueue, "enqueue" | "stop" | "pauseOrResume">;
  readonly load?: typeof loadSettings;
  readonly save?: typeof saveSettings;
  readonly explain?: typeof summarise;
}

function assistantText(ctx: ExtensionContext): string | undefined {
  const entry = ctx.sessionManager
    .getBranch()
    .toReversed()
    .find(
      (candidate) =>
        candidate.type === "message" && candidate.message.role === "assistant",
    );
  if (entry?.type !== "message" || entry.message.role !== "assistant")
    return undefined;
  return entry.message.content
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function notice(ctx: ExtensionContext, message: string): void {
  ctx.ui.notify(message, "info");
}

export class SpeakController {
  private readonly audio: Pick<
    AudioQueue,
    "enqueue" | "stop" | "pauseOrResume"
  >;
  private readonly load: typeof loadSettings;
  private readonly save: typeof saveSettings;
  private readonly explain: typeof summarise;
  private abortController: AbortController | undefined;
  private lastResponse: string | undefined;

  constructor(dependencies: SpeakControllerDependencies = {}) {
    this.audio = dependencies.audio ?? new AudioQueue();
    this.load = dependencies.load ?? loadSettings;
    this.save = dependencies.save ?? saveSettings;
    this.explain = dependencies.explain ?? summarise;
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.audio.stop();
  }

  pauseOrResume(): void {
    this.audio.pauseOrResume();
  }

  async handleSettled(ctx: ExtensionContext): Promise<void> {
    const settings = await this.load(ctx.cwd);
    if (!settings.enabled) return;
    await this.narrateLatest(ctx, settings, false);
  }

  async handleCommand(args: string, ctx: ExtensionContext): Promise<void> {
    const [action = "", value = ""] = args.trim().split(/\s+/u);
    const settings = await this.load(ctx.cwd);

    if (!action) {
      const next = await this.save(ctx.cwd, { enabled: !settings.enabled });
      notice(ctx, `Pi Speak ${next.enabled ? "on" : "off"}.`);
      if (!next.enabled) this.cancel();
      return;
    }
    if (action === "off") {
      await this.save(ctx.cwd, { enabled: false });
      this.cancel();
      notice(ctx, "Pi Speak off.");
      return;
    }
    if (action === "stop") {
      this.cancel();
      notice(ctx, "Speech stopped.");
      return;
    }
    if (action === "prev") {
      await this.narrateLatest(ctx, settings, true);
      return;
    }
    if (action === "explain") {
      await this.explainLatest(ctx, settings);
      return;
    }
    if (action === "voice" && value) {
      await this.save(ctx.cwd, { voice: value });
      notice(ctx, `Voice set to ${value}.`);
      return;
    }
    if (action === "rate" && /^[-+]\d+%$/u.test(value)) {
      await this.save(ctx.cwd, { rate: value });
      notice(ctx, `Rate set to ${value}.`);
      return;
    }
    if (action === "config") {
      const models = ctx.modelRegistry
        .getAll()
        .filter((model) => model.input.includes("text"));
      const choices = models.map((model) => `${model.provider}/${model.id}`);
      const choice = await ctx.ui.select("Pi Speak explanation model", choices);
      if (!choice) return;
      const [provider, ...idParts] = choice.split("/");
      const id = idParts.join("/");
      if (!provider || !id) {
        notice(ctx, "That model choice is invalid.");
        return;
      }
      const model = ctx.modelRegistry.find(provider, id);
      if (!model || !(await ctx.modelRegistry.getApiKeyAndHeaders(model)).ok) {
        notice(ctx, "That model is not authenticated.");
        return;
      }
      await this.save(ctx.cwd, { model: { provider, id } });
      notice(ctx, `Explanation model set to ${choice}.`);
      return;
    }
    if (action === "status") {
      notice(
        ctx,
        `Pi Speak ${settings.enabled ? "on" : "off"}; ${settings.voice} at ${settings.rate}; model ${settings.model.provider}/${settings.model.id}.`,
      );
      return;
    }
    if (action === "help") {
      notice(
        ctx,
        "Use /speak. Commands: prev, explain, off, stop, voice <name>, rate <±N%>, config, status, help.",
      );
      return;
    }
    notice(
      ctx,
      "Use /speak. Commands: prev, explain, off, stop, voice <name>, rate <±N%>, config, status, help.",
    );
  }

  private async narrateLatest(
    ctx: ExtensionContext,
    settings: SpeakSettings,
    manual: boolean,
  ): Promise<void> {
    const source = assistantText(ctx) ?? this.lastResponse;
    if (!source) {
      if (manual) notice(ctx, "No substantive response to speak.");
      return;
    }
    if (!manual && !qualifiesForSpeech(source, settings.minimumWords)) return;
    const protectedText = redactForExternalUse(source);
    if (!protectedText.safe) {
      if (manual)
        notice(ctx, "Skipped a response containing sensitive material.");
      return;
    }
    this.lastResponse = source;
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    try {
      const spoken = normaliseForSpeech(protectedText.text);
      if (this.abortController !== abortController) return;
      if (spoken) void this.audio.enqueue(spoken, settings);
      else if (manual) notice(ctx, "Could not make a speech-safe summary.");
    } finally {
      if (this.abortController === abortController)
        this.abortController = undefined;
    }
  }

  private async explainLatest(
    ctx: ExtensionContext,
    settings: SpeakSettings,
  ): Promise<void> {
    const source = assistantText(ctx) ?? this.lastResponse;
    if (!source) {
      notice(ctx, "No substantive response to speak.");
      return;
    }
    const protectedText = redactForExternalUse(source);
    if (!protectedText.safe) {
      notice(ctx, "Skipped a response containing sensitive material.");
      return;
    }
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    try {
      const explanation = await this.explain(
        { modelRegistry: ctx.modelRegistry },
        settings.model,
        protectedText.text,
        abortController.signal,
      );
      if (this.abortController !== abortController) return;
      const spoken = explanation ? normaliseForSpeech(explanation) : undefined;
      if (spoken) void this.audio.enqueue(spoken, settings);
      else notice(ctx, "Could not make a speech-safe summary.");
    } catch {
      if (abortController.signal.aborted) return;
      notice(ctx, "Explanation generation failed.");
    } finally {
      if (this.abortController === abortController)
        this.abortController = undefined;
    }
  }
}
