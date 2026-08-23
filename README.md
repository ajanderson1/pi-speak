# Pi Speak

Pi Speak is an opt-in Pi extension that turns each completed assistant response into a short direct spoken update: what happened, the result that matters, and what needs you. It does not read raw Markdown, code, paths, URLs, diffs, or tool output aloud.

## Requirements

- Pi 0.84.2 or later.
- Network access for the configured independent explanation model and Edge neural TTS.
- `uvx` plus Edge TTS access. The default voice is `en-GB-SoniaNeural` at `+5%`.

## Use

`/speak` enables or disables narration for the current working directory. It starts disabled.

- `/speak prev` — speak the latest assistant response directly.
- `/speak explain` — generate a one-shot independent explanation with the configured explanation model.
- `/speak off` / `/speak stop` — disable-and-stop or stop-only.
- `/speak voice <name>` / `/speak rate <±N%>` — change live TTS settings.
- `/speak config` — select an authenticated explanation model; default is `openai-codex/gpt-5.4-mini`.
- `/speak status` / `/speak help` — inspect configuration.
- `Ctrl+Shift+S` — pause or resume active audio.

Settings are stored per canonical working directory in `~/.pi/agent/extensions/pi-speak.json`.

## Security

Pi Speak redacts common API-key, token, password, and authorization values before calling the explanation model or the Edge TTS process. It refuses to speak private-key blocks. The model receives redacted assistant text only; it never inherits Pi's active session model.

## Verification

Run `./verify.sh 0`. Automated tests use fakes only: they do not call a model, Edge TTS, or audio player.
