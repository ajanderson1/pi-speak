const SMALL_NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

function numberToWords(value: number): string {
  if (value < 20) return SMALL_NUMBERS[value] ?? String(value);
  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)] ?? String(value);
    const remainder = value % 10;
    return remainder === 0 ? tens : `${tens}-${SMALL_NUMBERS[remainder]}`;
  }
  if (value < 1_000) {
    const remainder = value % 100;
    return `${SMALL_NUMBERS[Math.floor(value / 100)]} hundred${remainder ? ` ${numberToWords(remainder)}` : ""}`;
  }
  return String(value);
}

function replaceNumber(match: string, unit?: string): string {
  const value = Number(match);
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= 1_000
  )
    return match;
  return `${numberToWords(value)}${unit ? ` ${unit}` : ""}`;
}

/** True for a markdown table separator/ruler line, e.g. "|---|:--:|". */
function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/u.test(line);
}

/**
 * Safety net for markdown tables that slip past the summariser prompt.
 * Table rows read as literal pipes and dashes confuse a basic TTS engine,
 * so cells are joined into a short comma-separated sentence instead.
 */
function stripTables(text: string): string {
  return text
    .split(/\r?\n/u)
    .filter((line) => !isTableSeparator(line))
    .map((line) => {
      const row = /^\s*\|(.+)\|\s*$/u.exec(line);
      if (!row) return line;
      const cells = (row[1] ?? "")
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      return cells.length > 0 ? `${cells.join(", ")}.` : "";
    })
    .join("\n");
}

/** Any multi-segment filesystem path, relative or absolute. */
const PATH_PATTERN = /(?:[~.]{1,2})?\/?[\w.-]+(?:\/[\w.-]+)+/gu;

function basename(pathLike: string): string {
  const segments = pathLike.split("/").filter(Boolean);
  return segments.at(-1) ?? pathLike;
}

export function normaliseForSpeech(summary: string): string | undefined {
  let text = stripTables(summary.replace(/```[\s\S]*?```/gu, ". "))
    .replace(/https?:\/\/\S+/gu, "")
    // File paths are spoken as their file name only, never the directory.
    .replace(PATH_PATTERN, (match) => basename(match))
    // Inline code is unwrapped rather than dropped: the enclosed text (now
    // just a bare file name for paths) is still faithful to the response.
    .replace(/`([^`]*)`/gu, "$1")
    .replace(/^#{1,6}[ \t]+/gmu, "")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/gu, "$1")
    .replace(/__([^_\n]+)__/gu, "$1")
    // Single-underscore italics, e.g. "_also italic_" -> "also italic".
    // Boundary-anchored so it never touches an underscore inside a file
    // name such as foo_bar.ts, which has no delimiting underscore pair.
    .replace(/\b_([^_\n]+)_\b/gu, "$1")
    .replace(/^[ \t]*[-*+][ \t]+/gmu, "")
    .replace(/^[ \t]*\d+\.[ \t]+/gmu, "")
    .replace(/\b[a-f\d]{7,40}\b/giu, "")
    .replace(/[*#[\]{}<>|~^]/gu, " ")
    .replace(/;/gu, ".")
    .replace(/\bAPI\b/gu, "application programming interface")
    .replace(
      /\$(\d+)\.(\d{2})\b/gu,
      (_match, dollars: string, cents: string) =>
        `${replaceNumber(dollars)} dollars ${replaceNumber(cents)}`,
    )
    .replace(
      /\b(\d+)(GB|MB|KB|ms|s)\b/gu,
      (_match, value: string, unit: string) => {
        const units: Record<string, string> = {
          GB: "gigabytes",
          MB: "megabytes",
          KB: "kilobytes",
          ms: "milliseconds",
          s: "seconds",
        };
        return replaceNumber(value, units[unit] ?? unit);
      },
    )
    .replace(/\b(\d+)%/gu, (_match, value: string) =>
      replaceNumber(value, "percent"),
    )
    .replace(/\b\d+\b/gu, (value) => replaceNumber(value))
    .replace(/\s+/gu, " ")
    .replace(/\s+([.,!?])/gu, "$1")
    .trim();

  // A period immediately followed by a non-space character (as in a file
  // name's extension, e.g. "foo_bar.ts") is not a sentence boundary. Hide
  // it from the sentence splitter and restore it once splitting is done,
  // so file names are never torn apart or mis-capitalised mid-word.
  const NON_TERMINAL_DOT = "\u0000";
  text = text.replace(/\.(?=\S)/gu, NON_TERMINAL_DOT);

  // No sentence cap: the summariser already bounds length by its token
  // budget, and the transcript should stay faithful to the full response
  // rather than truncate to an arbitrary sentence count.
  const sentences = text.match(/[^.!?]+[.!?]?/gu) ?? [];
  text = sentences
    .map((sentence) => {
      const trimmed = sentence.trim();
      return trimmed ? `${trimmed[0]?.toUpperCase()}${trimmed.slice(1)}` : "";
    })
    .filter(Boolean)
    .join(" ")
    .replaceAll(NON_TERMINAL_DOT, ".");
  // Anything left matching these is unstripped markdown/table syntax or a
  // URL that leaked through — treat the summary as not speech-safe.
  return text && !/[`|~^]|https?:\/\//u.test(text) ? text : undefined;
}
