const TRIVIAL_ACKNOWLEDGEMENTS = new Set([
  "done",
  "got it",
  "ok",
  "okay",
  "thanks",
  "thanks, done",
]);

function withoutCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/gu, " ").trim();
}

export function qualifiesForSpeech(
  text: string,
  minimumWords: number,
): boolean {
  const withoutCode = withoutCodeFences(text);
  if (!withoutCode) return false;
  if (/^diff --git\b/iu.test(withoutCode)) return false;

  const normalised = withoutCode.replace(/[.!]/gu, "").trim().toLowerCase();
  if (TRIVIAL_ACKNOWLEDGEMENTS.has(normalised)) return false;

  return withoutCode.split(/\s+/u).length >= minimumWords;
}
