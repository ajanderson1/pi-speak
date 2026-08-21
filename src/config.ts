import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface ModelPreference {
  readonly provider: string;
  readonly id: string;
}

export interface SpeakSettings {
  readonly enabled: boolean;
  readonly voice: string;
  readonly rate: string;
  readonly minimumWords: number;
  readonly model: ModelPreference;
}

export const DEFAULT_SETTINGS: SpeakSettings = {
  enabled: false,
  voice: "en-GB-SoniaNeural",
  rate: "+5%",
  minimumWords: 12,
  model: { provider: "openai-codex", id: "gpt-5.4-mini" },
};

interface SettingsFile {
  readonly version: 1;
  readonly projects: Record<string, Partial<SpeakSettings>>;
}

export interface ConfigOptions {
  readonly configDirectory?: string;
}

function configPath(options: ConfigOptions): string {
  return join(
    options.configDirectory ?? join(homedir(), ".pi", "agent", "extensions"),
    "pi-speak.json",
  );
}

function keyFor(cwd: string): string {
  return resolve(cwd);
}

function normalise(value: Partial<SpeakSettings>): SpeakSettings {
  const model = value.model;
  return {
    enabled: value.enabled === true,
    voice:
      typeof value.voice === "string" && value.voice.trim()
        ? value.voice.trim()
        : DEFAULT_SETTINGS.voice,
    rate: /^[-+]\d+%$/u.test(value.rate ?? "")
      ? (value.rate as string)
      : DEFAULT_SETTINGS.rate,
    minimumWords:
      typeof value.minimumWords === "number" &&
      Number.isInteger(value.minimumWords) &&
      value.minimumWords >= 1
        ? value.minimumWords
        : DEFAULT_SETTINGS.minimumWords,
    model:
      model &&
      typeof model.provider === "string" &&
      typeof model.id === "string" &&
      model.provider &&
      model.id
        ? model
        : DEFAULT_SETTINGS.model,
  };
}

async function readSettings(options: ConfigOptions): Promise<SettingsFile> {
  try {
    const value: unknown = JSON.parse(
      await readFile(configPath(options), "utf8"),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("invalid settings");
    const candidate = value as Partial<SettingsFile>;
    return candidate.version === 1 &&
      candidate.projects &&
      typeof candidate.projects === "object"
      ? { version: 1, projects: candidate.projects }
      : { version: 1, projects: {} };
  } catch {
    return { version: 1, projects: {} };
  }
}

export async function loadSettings(
  cwd: string,
  options: ConfigOptions = {},
): Promise<SpeakSettings> {
  const file = await readSettings(options);
  return normalise(file.projects[keyFor(cwd)] ?? {});
}

export async function saveSettings(
  cwd: string,
  patch: Partial<SpeakSettings>,
  options: ConfigOptions = {},
): Promise<SpeakSettings> {
  const path = configPath(options);
  const file = await readSettings(options);
  const key = keyFor(cwd);
  const settings = normalise({ ...file.projects[key], ...patch });
  const next: SettingsFile = {
    version: 1,
    projects: { ...file.projects, [key]: settings },
  };
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
  return settings;
}
