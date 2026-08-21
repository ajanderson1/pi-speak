import { describe, expect, it, vi } from "vitest";
import { AudioQueue, type RunningProcess } from "../src/audio.ts";

function completedProcess(): RunningProcess {
  return { done: Promise.resolve(), kill: vi.fn() };
}

describe("AudioQueue", () => {
  it("serialises utterances and stops stale work", async () => {
    const start = vi.fn<
      (command: string, args: readonly string[]) => RunningProcess
    >(() => completedProcess());
    const queue = new AudioQueue({
      start,
      remove: vi.fn(async () => undefined),
    });

    await queue.enqueue("first", { voice: "voice", rate: "+5%" });
    await queue.enqueue("second", { voice: "voice", rate: "+5%" });

    expect(start.mock.calls.map(([command]) => command)).toEqual([
      "uvx",
      "afplay",
      "uvx",
      "afplay",
    ]);
    queue.stop();
    expect(queue.pendingCount).toBe(0);
  });

  it("pauses and resumes the active process", () => {
    let process: RunningProcess | undefined;
    const queue = new AudioQueue({
      start: () => {
        process = { done: new Promise(() => undefined), kill: vi.fn() };
        return process;
      },
    });

    void queue.enqueue("first", { voice: "voice", rate: "+5%" });

    expect(queue.pauseOrResume()).toBe(true);
    expect(process?.kill).toHaveBeenCalledWith("SIGSTOP");
    expect(queue.pauseOrResume()).toBe(false);
    expect(process?.kill).toHaveBeenCalledWith("SIGCONT");
  });
});
