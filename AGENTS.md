# Repository Instructions

This repo contains a small TypeScript coding-agent CLI built with `@earendil-works/pi-ai` and MiniMax.

## Project Shape

- Main entry point: `src/agent.ts`
- Runtime command: `npm run agent`
- Type check: `npm run typecheck`
- Environment template: `.env.example`

## Conventions

- Keep the agent simple and easy to run from a terminal.
- Prefer focused changes in `src/agent.ts` unless a feature clearly needs another file.
- Keep provider/model configuration environment-driven.
- Do not commit real API keys or `.env`.
- Preserve both interactive mode (`npm run agent`) and one-shot mode (`npm run agent -- "..."`) when changing CLI behavior.

## Verification

Run `npm run typecheck` after TypeScript changes.

For CLI startup checks that should not call MiniMax, use:

```bash
printf '/exit\n' | MINIMAX_API_KEY=dummy npm run agent
```
