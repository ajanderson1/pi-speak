import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { AudioQueue } from "./audio.ts";
import { loadSettings, saveSettings, type SpeakSettings } from "./config.ts";
import { normaliseForSpeech } from "./normalise.ts";
import { qualifiesForSpeech } from "./response.ts";
import { redactForExternalUse } from "./safety.ts";
import { summarise } from "./summarise.ts";

type Detail = "normal" | "more" | "less";

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
  private readonly audio = new AudioQueue();
  private abortController: AbortController | undefined;
  private lastResponse: string | undefined;

  cancel(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.audio.stop();
  }

  pauseOrResume(): void {
    this.audio.pauseOrResume();
  }

  async handleSettled(ctx: ExtensionContext): Promise<void> {
    const settings = await loadSettings(ctx.cwd);
    if (!settings.enabled) return;
    await this.speakLatest(ctx, settings, "normal", false);
  }

  async handleCommand(args: string, ctx: ExtensionContext): Promise<void> {
    const [action = "", value = ""] = args.trim().split(/\s+/u);
    const settings = await loadSettings(ctx.cwd);

    if (!action) {
      const next = await saveSettings(ctx.cwd, { enabled: !settings.enabled });
      notice(ctx, `Pi Speak ${next.enabled ? "on" : "off"}.`);
      if (!next.enabled) this.cancel();
      return;
    }
    if (action === "off") {
      await saveSettings(ctx.cwd, { enabled: false });
      this.cancel();
      notice(ctx, "Pi Speak off.");
      return;
    }
    if (action === "stop") {
      this.cancel();
      notice(ctx, "Speech stopped.");
      return;
    }
    if (action === "that") {
      await this.speakLatest(ctx, settings, "normal", true);
      return;
    }
    if (action === "resummarise" && (value === "more" || value === "less")) {
      await this.speakLatest(ctx, settings, value, true);
      return;
    }
    if (action === "voice" && value) {
      await saveSettings(ctx.cwd, { voice: value });
      notice(ctx, `Voice set to ${value}.`);
      return;
    }
    if (action === "rate" && /^[-+]\d+%$/u.test(value)) {
      await saveSettings(ctx.cwd, { rate: value });
      notice(ctx, `Rate set to ${value}.`);
      return;
    }
    if (action === "config") {
      const models = ctx.modelRegistry
        .getAll()
        .filter((model) => model.input.includes("text"));
      const choices = models.map((model) => `${model.provider}/${model.id}`);
      const choice = await ctx.ui.select("Pi Speak summariser model", choices);
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
      await saveSettings(ctx.cwd, { model: { provider, id } });
      notice(ctx, `Summariser model set to ${choice}.`);
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
        "Use /speak to toggle. Commands: that, resummarise more|less, off, stop, voice <name>, rate <±N%>, config, status.",
      );
      return;
    }
    notice(
      ctx,
      "Use /speak [that|resummarise more|less|off|stop|voice <name>|rate <±N%>|config|status|help].",
    );
  }

  private async speakLatest(
    ctx: ExtensionContext,
    settings: SpeakSettings,
    detail: Detail,
    manual: boolean,
  ): Promise<void> {
    const source = this.lastResponse ?? assistantText(ctx);
    if (!source || !qualifiesForSpeech(source, settings.minimumWords)) {
      if (manual) notice(ctx, "No substantive response to speak.");
      return;
    }
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
      const result = await summarise(
        ctx,
        settings.model,
        protectedText.text,
        detail,
        abortController.signal,
      );
      if (this.abortController !== abortController) return;
      const spoken = result ? normaliseForSpeech(result) : undefined;
      if (spoken) void this.audio.enqueue(spoken, settings);
      else if (manual) notice(ctx, "Could not make a speech-safe summary.");
    } catch {
      if (manual && !abortController.signal.aborted)
        notice(ctx, "Summary generation failed.");
    } finally {
      if (this.abortController === abortController)
        this.abortController = undefined;
    }
  }
}
