# Pi Speak

Pi Speak is an opt-in Pi extension that turns each completed assistant response into a spoken narration for a very basic text-to-speech engine. Every response is run through a cheap summariser model first: the first sentence is always a TLDR of what the response is about, and the rest narrates the response faithfully in plain prose — covering the same points, results, and required actions, not just a terse blurb. Markdown formatting (headers, bullets, emphasis, code fences, inline code) is stripped rather than read literally; tables are described in a sentence or two instead of read cell-by-cell; file references are spoken as their file name only, never the full path. It does not read raw code, URLs, diffs, or tool output aloud — an earlier version read raw symbols character-by-character ("slash", "dot", "underscore"), which proved unintelligible.

## Requirements

- Pi 0.84.2 or later.
- Network access for the configured independent explanation model and Edge neural TTS.
- `uvx` plus Edge TTS access. The default voice is `en-GB-SoniaNeural` at `+5%`.

## Use

`/speak` enables or disables narration for the current working directory. It starts disabled.

- `/speak prev` (alias `/speak explain`) — replay the latest assistant response through the summariser now.
- `/speak off` / `/speak stop` — disable-and-stop or stop-only.
- `/speak voice <name>` / `/speak rate <±N%>` — change live TTS settings.
- `/speak config` — select a summary model from Pi's scoped models (`--models`/`enabledModels`, same set `/scoped-models` shows), falling back to all authenticated models when nothing is scoped; default is `openai-codex/gpt-5.4-mini`.
- `/speak status` / `/speak help` — inspect configuration.

Settings are stored per canonical working directory in `~/.pi/agent/extensions/pi-speak.json`.

## Security

Pi Speak redacts common API-key, token, password, and authorization values before calling the explanation model or the Edge TTS process. It refuses to speak private-key blocks. The model receives redacted assistant text only; it never inherits Pi's active session model.

## Verification

Run `./verify.sh 0`. Automated tests use fakes only: they do not call a model, Edge TTS, or audio player.
