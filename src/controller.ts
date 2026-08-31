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
    await this.speakLatest(ctx, settings, false);
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
    // "prev" and "explain" are the same manual replay now that the
    // summariser runs by default; both are kept so neither muscle memory
    // nor scripts that call one of them break.
    if (action === "prev" || action === "explain") {
      await this.speakLatest(ctx, settings, true);
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
      // Prefer the models Pi itself is scoped to (--models / enabledModels,
      // the same set `/scoped-models` shows). Only fall back to the full
      // authenticated catalogue when the session has no scoping configured,
      // so this list doesn't balloon to every provider Pi knows about.
      const scoped = ctx.scopedModels.map((scopedModel) => scopedModel.model);
      const candidates =
        scoped.length > 0 ? scoped : ctx.modelRegistry.getAvailable();
      const models = candidates.filter((model) => model.input.includes("text"));
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
        "Use /speak. Commands: prev, off, stop, voice <name>, rate <±N%>, config, status, help.",
      );
      return;
    }
    notice(
      ctx,
      "Use /speak. Commands: prev, off, stop, voice <name>, rate <±N%>, config, status, help.",
    );
  }

  /**
   * Runs a completed response through the cheap summariser model — a TLDR
   * sentence first, then a faithful, speech-safe narration of the rest —
   * and speaks the result. This is now the default path for both the
   * automatic post-response narration and a manual replay; there is no
   * longer a separate raw pass-through, because reading raw markdown,
   * paths, and code symbol-by-symbol proved unintelligible.
   */
  private async speakLatest(
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
      const explanation = await this.explain(
        { modelRegistry: ctx.modelRegistry },
        settings.model,
        protectedText.text,
        abortController.signal,
      );
      if (this.abortController !== abortController) return;
      const spoken = explanation ? normaliseForSpeech(explanation) : undefined;
      if (spoken) void this.audio.enqueue(spoken, settings);
      else if (manual) notice(ctx, "Could not make a speech-safe summary.");
    } catch {
      if (abortController.signal.aborted) return;
      if (manual) notice(ctx, "Explanation generation failed.");
    } finally {
      if (this.abortController === abortController)
        this.abortController = undefined;
    }
  }
}
