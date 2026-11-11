---
title: "Plan #646: Materials folder atomic cycle/depth guard and TA RBAC split"
date: 2026-11-11
summary: "Validated and red-teamed 3-phase TDD handover plan for issue #646"
---

# Plan #646: Materials folder atomic cycle/depth guard and TA RBAC split

## What happened
Created and red-teamed 3-phase TDD handover plan `plans/261111-0344-646-materials-folder-race-and-rbac` for GitHub issue #646 in worktree `fix/646-materials-folder-race-and-rbac`.

## Decision
- Enforce folder cycle and max-depth (5) invariants atomically inside SQLite/D1 `UPDATE ... WHERE (WITH RECURSIVE ...)` and `INSERT ... SELECT ... WHERE (WITH RECURSIVE ...)` rather than write-then-revert, and make `PATCH /materials/folders/:id` update `name` and `parentId` partially so concurrent rename and move never clobber each other.
- Recover unreachable cyclic components in `flattenFolderTree` starting from the `byName`-smallest node on each component's cycle, clamp folder tree indentation to `MATERIAL_FOLDER_MAX_DEPTH - 1` across `FolderPanel`, `FolderSelect` (preserving NBSP), and `MaterialBankBrowser`, and derive `effectiveParentId` in `FolderDialog`.
- Decouple `MATERIAL_READ_ROLES` / `MATERIAL_WRITE_ROLES` (`canReadMaterials` / `canWriteMaterials`) in `@teacher-os/auth/role` from grading permissions and hide all write controls/dialogs for `ta` across `/materials`, `SessionMaterialsModal`, and `MaterialPicker`.

## Next steps
Commit and push plan artifacts (`ak-git cp`), update issue #646 with `ready to cook` -> `in progress`, and execute Phases 1–3 via `/ak-fix --auto --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
