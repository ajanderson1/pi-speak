import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ModelPreference } from "./config.ts";

export const EXPLANATION_SYSTEM_PROMPT = [
  "You convert a completed coding-agent response into a narration for a very basic text-to-speech engine.",
  "Start with exactly one TLDR sentence that sums up what the response is about, before any detail.",
  "Then narrate the rest of the response faithfully and in the same order: cover every substantive point, result, number, and required human action. Do not compress away detail that changes meaning, and do not pad with filler or repeat the TLDR.",
  "Write plain prose sentences only. Never use markdown, headers, bullet or numbered list markers, code fences, inline code, or table syntax.",
  "If the source contains a table, describe its content and pattern in one or two spoken sentences instead of reading cells or separators.",
  "When you mention a file, speak only its file name, never its directory path.",
  "Never read out URLs, commit hashes, secrets, or raw code syntax; describe what they are for instead.",
].join(" ");

export async function summarise(
  ctx: Pick<ExtensionContext, "modelRegistry">,
  modelPreference: ModelPreference,
  source: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const model = ctx.modelRegistry.find(
    modelPreference.provider,
    modelPreference.id,
  );
  if (!model) return undefined;
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return undefined;

  const response = await complete(
    model,
    {
      systemPrompt: EXPLANATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: source }],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      ...(auth.headers ? { headers: auth.headers } : {}),
      ...(auth.env ? { env: auth.env } : {}),
      maxTokens: 260,
      maxRetries: 0,
      cacheRetention: "none",
      timeoutMs: 8_000,
      ...(signal ? { signal } : {}),
    },
  );

  if (response.stopReason !== "stop") return undefined;
  return response.content
    .filter(
      (block): block is { type: "text"; text: string } =>
        block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join(" ")
    .trim();
}
