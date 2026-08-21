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
  readonly detectPlayer?: () => Promise<string | undefined>;
}

interface Job {
  readonly text: string;
  readonly settings: AudioSettings;
}

let detectedPlayer: Promise<string | undefined> | undefined;

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

function commandExists(command: string): Promise<boolean> {
  const child = spawn("which", [command], { stdio: "ignore" });
  return new Promise((resolve) => {
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

async function defaultDetectPlayer(): Promise<string | undefined> {
  const candidates =
    process.platform === "darwin"
      ? ["afplay", "ffplay", "mpv", "paplay"]
      : ["ffplay", "mpv", "paplay"];
  for (const candidate of candidates) {
    if (await commandExists(candidate)) return candidate;
  }
  return undefined;
}

export class AudioQueue {
  private readonly queue: Job[] = [];
  private readonly start: NonNullable<AudioDependencies["start"]>;
  private readonly remove: NonNullable<AudioDependencies["remove"]>;
  private readonly configuredPlayer: string | undefined;
  private readonly detectPlayer: () => Promise<string | undefined>;
  private active = false;
  private paused = false;
  private generation = 0;
  private activeProcess: RunningProcess | undefined;

  constructor(dependencies: AudioDependencies = {}) {
    this.start = dependencies.start ?? defaultStart;
    this.remove = dependencies.remove ?? ((path) => rm(path, { force: true }));
    this.configuredPlayer = dependencies.player;
    this.detectPlayer =
      dependencies.detectPlayer ??
      (() => {
        detectedPlayer ??= defaultDetectPlayer();
        return detectedPlayer;
      });
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
      const player = this.configuredPlayer ?? (await this.detectPlayer());
      if (!player || generation !== this.generation) return;
      await this.run(
        player,
        player === "ffplay"
          ? ["-nodisp", "-autoexit", mediaPath]
          : player === "mpv"
            ? ["--no-video", mediaPath]
            : [mediaPath],
      );
    } catch {
      // Playback is best effort and must never affect Pi.
    } finally {
      await this.remove(mediaPath).catch(() => undefined);
    }
  }
}
