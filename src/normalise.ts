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

function pronounceTechnicalSymbols(text: string): string {
  return text
    .replace(/!==/gu, " does not strictly equal ")
    .replace(/===/gu, " strictly equals ")
    .replace(/=>/gu, " maps to ")
    .replace(/!=/gu, " does not equal ")
    .replace(/==/gu, " equals ")
    .replace(/>=/gu, " greater than or equal to ")
    .replace(/<=/gu, " less than or equal to ")
    .replace(/&&/gu, " and ")
    .replace(/\|\|/gu, " or ")
    .replace(/(?<=[\p{L}\p{N}_-])\.(?=[\p{L}\p{N}_-])/gu, " dot ")
    .replace(/=/gu, " equals ")
    .replace(/\//gu, " slash ")
    .replace(/\\/gu, " backslash ")
    .replace(/_/gu, " underscore ")
    .replace(/@/gu, " at ")
    .replace(/#/gu, " hash ")
    .replace(/\(/gu, " open parenthesis ")
    .replace(/\)/gu, " close parenthesis ")
    .replace(/\[/gu, " open bracket ")
    .replace(/\]/gu, " close bracket ")
    .replace(/\{/gu, " open brace ")
    .replace(/\}/gu, " close brace ")
    .replace(/&/gu, " ampersand ")
    .replace(/\|/gu, " pipe ")
    .replace(/~/gu, " tilde ")
    .replace(/\^/gu, " caret ")
    .replace(/>/gu, " greater than ")
    .replace(/</gu, " less than ");
}

export function normaliseForSpeech(response: string): string | undefined {
  let text = pronounceTechnicalSymbols(
    response.replace(/```[\p{L}\p{N}_-]*/gu, " "),
  )
    .replace(/[^\p{L}\p{N}\s.!?,%$]/gu, " ")
    .replace(/\b(?:the\s+)?project\s+files?\b/giu, "")
    .replace(/\b[a-f\d]{7,40}\b/giu, "")
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

  const sentences = text.match(/[^.!?]+[.!?]?/gu) ?? [];
  text = sentences
    .map((sentence) => {
      const trimmed = sentence.trim();
      return trimmed ? `${trimmed[0]?.toUpperCase()}${trimmed.slice(1)}` : "";
    })
    .filter(Boolean)
    .join(" ");
  return text && !/[`_/]/u.test(text) ? text : undefined;
}
