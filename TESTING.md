# Testing

## R0 — unit and Pi-load smoke

Run `./verify.sh 0`.

It formats, lints, typechecks, runs all Vitest tests, and asks a clean Pi RPC instance to list the extension's `/speak` command. Evidence is written under `assets/verification/0/`.

Tests never make network, Edge TTS, or real audio calls. A manual smoke test must use non-sensitive fixture text.
