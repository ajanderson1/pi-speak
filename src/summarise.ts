import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ModelPreference } from "./config.ts";

const SYSTEM_PROMPT = [
  "Summarise this completed coding-agent response for speech.",
  "Write one to three plain sentences, about forty words.",
  "State what happened, the important concrete result or number, and what the human needs to do.",
  "Drop preamble, caveats, repeated context, markdown, code, paths, URLs, hashes, and secrets.",
].join(" ");

export async function summarise(
  ctx: Pick<ExtensionContext, "modelRegistry">,
  modelPreference: ModelPreference,
  source: string,
  detail: "normal" | "more" | "less" = "normal",
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
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Detail: ${detail}\n\nResponse:\n${source}` },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      ...(auth.headers ? { headers: auth.headers } : {}),
      ...(auth.env ? { env: auth.env } : {}),
      maxTokens: detail === "more" ? 150 : detail === "less" ? 60 : 100,
      maxRetries: 0,
      cacheRetention: "none",
      timeoutMs: 4_000,
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
