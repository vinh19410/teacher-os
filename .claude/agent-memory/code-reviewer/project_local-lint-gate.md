---
name: local-lint-gate
description: root `biome check .` fails locally because of nested biome.json in .claude/worktrees; scope lint to apps/packages during reviews
metadata:
  type: project
---

Running `pnpm exec biome check .` at the repo root on the main checkout fails with "nested root configuration" errors coming from `.claude/worktrees/*/biome.json`. This happens on the local machine only. CI uses a clean checkout and is not affected.

**Why:** sibling agent worktrees live inside `.claude/worktrees/` (see [[worktree-reviews]]), and biome picks up their root configs.

**How to apply:** when running local review gates, use `pnpm exec biome check apps packages`, and do not report the root failure as a defect of the diff.
