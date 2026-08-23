import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ModelPreference } from "./config.ts";

export const EXPLANATION_SYSTEM_PROMPT =
  "Explain completed coding-agent response in plain language someone with limited prior knowledge this project. Speak as agent using I, address human listener as you, preserve concrete outcomes next actions, omit markdown, code, paths, URLs, hashes, secrets.";

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
      maxTokens: 150,
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
