---
phase: 1
title: "Dời route từ vựng sang /practice/vocabulary + redirect legacy + dọn nav/link"
status: pending
priority: P2
effort: "1.5h"
dependsOn: []
---

# Phase 1 — Dời route + redirect legacy + dọn nav/link

## Context

- Route student dùng TanStack file-based routing, `routeTree.gen.ts` sinh bởi
  `tanstackRouter` plugin trong `apps/student/vite.config.ts` (chạy khi `vite build`/`vite dev`).
- `practice/$skill.tsx` bắt `vocabulary` qua `SKILL_SLUGS` và render
  `VocabPracticeCatalog`. Static segment `practice/vocabulary/` sẽ thắng `$skill`.
- `vocab/$deckId.tsx` là layout: khi có child `session` match thì render `<Outlet/>`.

## Files

| File | Hành động |
|---|---|
| `apps/student/src/routes/_auth/vocab/index.tsx` → `routes/_auth/practice/vocabulary/index.tsx` | `git mv`; route id `/_auth/practice/vocabulary/`; header theo khuôn trang Luyện tập (kicker mono + h1 "Từ vựng"), bỏ link "← Trang chủ" (nav đã có) |
| `routes/_auth/vocab/$deckId.tsx` → `routes/_auth/practice/vocabulary/$deckId.tsx` | `git mv`; id + mọi `to` |
| `routes/_auth/vocab/$deckId.session.tsx` → `routes/_auth/practice/vocabulary/$deckId.session.tsx` | `git mv`; id + `handleExit` navigate |
| `routes/_auth/vocab/courses/index.tsx` → `routes/_auth/practice/vocabulary/courses/index.tsx` | `git mv`; id + `to` |
| `routes/_auth/vocab/courses/$courseId.tsx` → `routes/_auth/practice/vocabulary/courses/$courseId.tsx` | `git mv`; id + `to` |
| `routes/_auth/vocab/index.tsx` (mới, redirect) | `beforeLoad` → `redirect({ href: legacyVocabHref(...), replace: true })` |
| `routes/_auth/vocab/$.tsx` (mới, splat redirect) | như trên cho `/vocab/<rest>` |
| `apps/student/src/lib/legacy-vocab-redirect.ts` (mới) | hàm thuần `legacyVocabHref(pathname, searchStr)`: thay prefix `/vocab` bằng `/practice/vocabulary`, giữ đuôi + search |
| `routes/_auth/practice/$skill.tsx` | bỏ `vocabulary` khỏi `SKILL_SLUGS`/`SKILL_LABELS`/`SKILL_KICKERS`, bỏ nhánh `VocabPracticeCatalog` (còn lại 4 skill dùng `SkillCatalog`) |
| `apps/student/src/components/practice/vocab-practice-catalog.tsx` | xoá |
| `apps/student/src/components/layout/student-nav.tsx` | bỏ item `vocab` ("Từ vựng"), bỏ `"/vocab"` trong `ACTIVE_KEY_BY_PREFIX`, bỏ `vocab` trong `STUDENT_PAGE_LABEL`; giữ child `practice-vocabulary` href `/practice/vocabulary`; xoá import `BookA` nếu không còn dùng |
| `apps/student/src/routes/_auth/index.tsx` | card trang chủ `to="/vocab"` → `/practice/vocabulary` |
| `apps/student/src/components/vocab/vocab-courses-cta.tsx` | `/vocab/courses` → `/practice/vocabulary/courses` |
| `apps/student/src/components/vocab/vocab-lesson-card.tsx` | `/vocab/$deckId` → `/practice/vocabulary/$deckId` |
| `apps/student/src/routeTree.gen.ts` | tái sinh qua `vite build` (không sửa tay) |

## Steps

1. `git mv` 5 route file vào `routes/_auth/practice/vocabulary/` (giữ lịch sử git).
2. Sửa `createFileRoute("...")` id trong từng file cho khớp path mới.
3. Thay mọi `to`/`navigate({ to })` dạng `/vocab...` thành `/practice/vocabulary...`
   (danh sách đã scout: `index.tsx` L39, L231; `$deckId.tsx` L55, L63, L101, L110, L137, L159;
   `$deckId.session.tsx` L57; `courses/index.tsx` L65, L192, L203; `courses/$courseId.tsx`
   L110, L228, L240; `vocab-courses-cta.tsx` L10; `vocab-lesson-card.tsx` L83; `_auth/index.tsx` L229).
4. Header hub: đổi sang khuôn `practice/$skill.tsx` (kicker "Spaced Repetition · 5 Memory Levels",
   h1 "Từ vựng"); giữ nguyên các section còn lại và mọi `data-testid`.
5. Viết `legacy-vocab-redirect.ts` + 2 route redirect (`vocab/index.tsx`, `vocab/$.tsx`).
6. Dọn `$skill.tsx`, xoá `vocab-practice-catalog.tsx` (kiểm `Pager` vẫn còn được `SkillCatalog` dùng).
7. Sửa `student-nav.tsx`.
8. `pnpm --filter student build` để tái sinh `routeTree.gen.ts`; kiểm có
   `/_auth/practice/vocabulary/...` và không còn route `/_auth/vocab/$deckId`.

## Validation

- `grep -rn '"/vocab' apps/student/src --include='*.tsx' --include='*.ts' | grep -v routeTree.gen | grep -v 'routes/_auth/vocab/'` → rỗng.
- `pnpm check` và `pnpm check-types` xanh (typed `to` của TanStack bắt link sai path).

## Risk / Rollback

- Rollback = revert commit (thuần frontend, không migration).
- Nếu splat `vocab/$.tsx` không match `/vocab` trần thì `vocab/index.tsx` lo phần đó — giữ cả hai.
