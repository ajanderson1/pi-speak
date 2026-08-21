export interface RedactionResult {
  readonly text: string;
  readonly redacted: boolean;
  readonly safe: boolean;
}

const UNSAFE_BLOCK = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/iu;
const ASSIGNMENT =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|token|password|passwd|secret)\b\s*([:=])\s*[^\s,;]+/giu;
const AUTHORIZATION = /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[^\s,;]+/giu;

export function redactForExternalUse(input: string): RedactionResult {
  if (UNSAFE_BLOCK.test(input)) {
    return { text: "", redacted: true, safe: false };
  }

  let redacted = false;
  const text = input
    .replace(AUTHORIZATION, () => {
      redacted = true;
      return "Authorization: [redacted]";
    })
    .replace(ASSIGNMENT, (_match, name: string, separator: string) => {
      redacted = true;
      return `${name}${separator} [redacted]`;
    });

  return { text, redacted, safe: true };
}
