---
name: verify-change
description: Choose and run the checks for a change in the Curvehop public review edition, then report the results. Use before opening a pull request or saying a change is done.
---

# Verify a change

1. Start from a clean install: `pnpm install --frozen-lockfile`.
2. Classify the change. More than one row can apply.

| Change | Run |
| --- | --- |
| Docs or diagrams only | `pnpm verify:source`. If diagrams changed, also run the `architecture-diagram` steps. Open every changed link. |
| `app/`, `components/`, `lib/` | `pnpm typecheck`, `pnpm test`, `pnpm build`, then `pnpm test:http` |
| Shared cache, preferences, revision handling | The row above plus `pnpm test:sensitivity` |
| JEV contract (`lib/jev-shadow*.ts`) | `pnpm test` and `pnpm test:sensitivity` |
| Fictional fixtures (`data/`, `scripts/demo-data.ts`) | `pnpm demo:reset`, then `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:http` |
| `tests/`, `scripts/`, `proxy.ts`, `next.config.ts`, `package.json`, CI | The full CI order: `pnpm verify:source`, `pnpm typecheck`, `pnpm test`, `pnpm test:sensitivity`, `pnpm build`, `pnpm test:http` |

3. `pnpm test:http` uses the production build. Run `pnpm build` first.
4. Report the commands that ran, pass or fail, and the failing output. Name anything you did not check.
5. Do not weaken or delete a test to make it pass. If a test is wrong, fix it in a separate commit and explain why.

Passing checks cover only what this repository contains. They are not evidence of production accuracy, latency, or availability.
