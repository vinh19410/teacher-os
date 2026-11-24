# Plan: #845 — Server-side pagination for Admin `/library/tests`

- **Issue**: #845 (`ai-handle`, `in progress`)
- **Branch**: `vinh19410/Thêm-phân-trang-tại-admin-library-tests` → target `develop` (`--beta --merge`)
- **Status**: Verified — ready for isolated re-review & ship to `develop`

## Scope & Acceptance Criteria (Locked Handoff Brief)
1. `GET /api/admin/library/tests` supports `?page=&pageSize=` (`10 | 20 | 50`, default `20`), returns `{ tests, total, page, pageSize, totalPages, counts: { skill, status } }` ordered by `updatedAt DESC, id DESC`; preserves backwards compatibility when `page`/`pageSize` are omitted; returns HTTP 400 on invalid `page`/`pageSize`.
2. `/library/tests` syncs `?skill=&status=&q=&page=&pageSize=` in URL (omitting defaults), resets `page=1` on filter/`pageSize` change, always displays `PaginationBar` when `total > 0` (even on 1 page), clamps/redirects out-of-range page (manual URL or deleting last item on last page), uses `keepPreviousData`, and preserves full collection/group suggestions on `/library/tests/new`.
3. All tests in `packages/api`, `apps/server`, `apps/admin`, `pnpm exec biome check .`, and `pnpm check-types` pass.
4. UI verified at 3 viewports (`1440×900`, `768×1024`, `375×812`) + light/dark mode + keyboard focus per `DESIGN.md` & `REVIEW.md`.
5. Isolated code review clean; PR to `develop` green & merged; GitHub issue updated through `in progress` → `in review` → `done` → `shipped` with full POT + SHA-pinned screenshots.

## Execution Phases & File Ownership
- **Phase 1 (Contract — foundation)**: `packages/api/src/library-contracts.ts`, `packages/api/src/library-contracts.test.ts`
- **Phase 2A (Backend — parallel with 2B)**: `apps/server/src/routes/admin-library.ts`, `apps/server/src/routes/admin-library.test.ts`
- **Phase 2B (Admin UI — parallel with 2A)**:
  - `apps/admin/src/lib/repos/library.ts`, `apps/admin/src/lib/repos/library.test.ts`
  - `apps/admin/src/components/library/library-filters.ts`, `apps/admin/src/components/library/library-filters.test.ts`
  - `apps/admin/src/components/library/pagination-bar.tsx`, `apps/admin/src/components/library/pagination-bar.test.tsx`
  - `apps/admin/src/routes/_auth/library/tests/index.tsx`, `apps/admin/src/routes/_auth/library/tests/index.test.tsx`
- **Phase 3 (Integration, Verification, Screenshots, Isolated Review, Ship & Merge)**: orchestrator verifies all gates, captures 3-viewport light/dark screenshots, runs isolated `code-reviewer`, posts POT on #845, opens & merges PR into `develop`.
