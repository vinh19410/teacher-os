---
title: "Fix #646: Materials atomic folder cycle/depth guard and TA RBAC split"
date: 2026-11-11
summary: "Implemented atomic SQL WITH RECURSIVE folder guards, client cycle recovery, independent material RBAC, and TA read-only web UI"
---

# Fix #646: Materials atomic folder cycle/depth guard and TA RBAC split

## What happened
Implemented all 3 phases of `plans/261111-0344-646-materials-folder-race-and-rbac` for issue #646:
- Added `MATERIAL_WRITE_ROLES`, `MATERIAL_READ_ROLES`, `canWriteMaterials`, and `canReadMaterials` in `packages/auth/src/role.ts` with dedicated lookup maps and 109 passing unit tests.
- Replaced `canReviewGrade`/`canPublishGrade` in `apps/server/src/routes/materials.ts` and added atomic `WITH RECURSIVE` SQL guards on `POST /materials/folders` (`insertChildFolder`) and `PATCH /materials/folders/:id` (`folderMoveGuard`), symmetric partial `.set` updates (`nameChanged`/`parentChanged`), and 1x retry + deterministic 0-row/collision classification; all 105 server test files (1383 tests) pass.
- Updated `flattenFolderTree` in `apps/web/src/lib/material-folders.ts` to render cyclic components from the `byName`-minimum node on each cycle, clamped depth in `FolderPanel`, `FolderSelect` (preserving NBSP), and `MaterialBankBrowser`, synced `effectiveParentId` in `FolderDialog`, and hid all write controls/dialogs for `ta` via `useCanWriteMaterials()` across `/materials`, `SessionMaterialsModal`, and `MaterialPicker`; all 192 web test files (2020 tests) pass and 3-viewport light/dark POT screenshots verified.

## Decision
Used atomic single-statement `WITH RECURSIVE` guards in SQLite/D1 instead of write-then-revert to prevent dirty reads, livelock, and unique-index revert failures, and subscribed `useCanWriteMaterials()` via `useSyncExternalStore` on `QueryCache` with `"teacher"` fallback so existing bare-`QueryClientProvider` unit tests remain compatible.

## Next steps
Complete local `code-reviewer` gate, `design:compare`, `docs/system-architecture.md` sync, ship beta PR to `develop`, run PR review/reply, merge, watch `develop` CI to green, and post POT comment on #646.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
