## What changed

<!-- Title: `type(scope): summary` -->

## Why

<!-- The problem this solves or what it makes reviewable -->

## Checks

<!-- Tick only what actually ran. Give the reason for any failure or skip. See .agents/skills/verify-change -->

- [ ] `pnpm verify:source`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build` → `pnpm test:http`
- [ ] `pnpm test:sensitivity` (cache, preferences, revision, or JEV changes)
- [ ] `node docs/architecture/build.mjs` and `capture.mjs` (diagram changes)

## Not verified

<!-- What was not checked, and how this differs from production -->
