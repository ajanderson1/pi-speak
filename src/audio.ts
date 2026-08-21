import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface AudioSettings {
  readonly voice: string;
  readonly rate: string;
}

export interface RunningProcess {
  readonly done: Promise<void>;
  kill(signal?: NodeJS.Signals): void;
}

export interface AudioDependencies {
  readonly start?: (command: string, args: readonly string[]) => RunningProcess;
  readonly remove?: (path: string) => Promise<void>;
  readonly player?: string;
}

interface Job {
  readonly text: string;
  readonly settings: AudioSettings;
}

function defaultStart(
  command: string,
  args: readonly string[],
): RunningProcess {
  const child = spawn(command, args, { stdio: "ignore" });
  return {
    done: new Promise<void>((resolve) => {
      child.once("error", resolve);
      child.once("exit", resolve);
    }),
    kill: (signal) => child.kill(signal),
  };
}

export class AudioQueue {
  private readonly queue: Job[] = [];
  private readonly start: NonNullable<AudioDependencies["start"]>;
  private readonly remove: NonNullable<AudioDependencies["remove"]>;
  private readonly player: string;
  private active = false;
  private paused = false;
  private generation = 0;
  private activeProcess: RunningProcess | undefined;

  constructor(dependencies: AudioDependencies = {}) {
    this.start = dependencies.start ?? defaultStart;
    this.remove = dependencies.remove ?? ((path) => rm(path, { force: true }));
    this.player =
      dependencies.player ??
      (process.platform === "darwin" ? "afplay" : "ffplay");
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  async enqueue(text: string, settings: AudioSettings): Promise<void> {
    this.queue.push({ text, settings });
    if (!this.active) await this.drain();
  }

  stop(): void {
    this.generation++;
    this.queue.length = 0;
    this.paused = false;
    this.activeProcess?.kill("SIGTERM");
    this.activeProcess = undefined;
  }

  pauseOrResume(): boolean {
    if (!this.activeProcess) return false;
    this.paused = !this.paused;
    this.activeProcess.kill(this.paused ? "SIGSTOP" : "SIGCONT");
    return this.paused;
  }

  private async drain(): Promise<void> {
    this.active = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (job) await this.play(job);
      }
    } finally {
      this.active = false;
    }
  }

  private async run(command: string, args: readonly string[]): Promise<void> {
    const process = this.start(command, args);
    this.activeProcess = process;
    await process.done;
    if (this.activeProcess === process) this.activeProcess = undefined;
  }

  private async play(job: Job): Promise<void> {
    const generation = this.generation;
    const mediaPath = join(tmpdir(), `pi-speak-${randomUUID()}.mp3`);
    try {
      await this.run("uvx", [
        "--from",
        "edge-tts",
        "edge-tts",
        "--voice",
        job.settings.voice,
        "--rate",
        job.settings.rate,
        "--text",
        job.text,
        "--write-media",
        mediaPath,
      ]);
      if (generation !== this.generation) return;
      await this.run(
        this.player,
        this.player === "ffplay"
          ? ["-nodisp", "-autoexit", mediaPath]
          : [mediaPath],
      );
    } catch {
      // Playback is best effort and must never affect Pi.
    } finally {
      await this.remove(mediaPath).catch(() => undefined);
    }
  }
}
