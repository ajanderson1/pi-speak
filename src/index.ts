import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SpeakController } from "./controller.ts";

export default function extension(pi: ExtensionAPI): void {
  const controller = new SpeakController();

  pi.on("input", () => {
    controller.cancel();
    return { action: "continue" as const };
  });
  pi.on("agent_start", () => controller.cancel());
  pi.on("agent_settled", async (_event, ctx) => controller.handleSettled(ctx));
  pi.on("session_shutdown", () => controller.cancel());

  pi.registerCommand("speak", {
    description: "Control spoken Pi responses",
    handler: async (args, ctx) => controller.handleCommand(args, ctx),
  });
  pi.registerShortcut("ctrl+shift+s", {
    description: "Pause or resume current Pi Speak playback",
    handler: async () => controller.pauseOrResume(),
  });
}
