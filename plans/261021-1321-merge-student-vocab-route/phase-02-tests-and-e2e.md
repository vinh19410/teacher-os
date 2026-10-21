---
phase: 2
title: "Cập nhật unit test, e2e và verify UI 3 viewport"
status: pending
priority: P2
effort: "1.5h"
dependsOn: [1]
---

# Phase 2 — Test, e2e, verify

## Files

| File | Hành động |
|---|---|
| `apps/student/src/components/vocab/vocab-course-catalog.test.tsx` | import route từ `@/routes/_auth/practice/vocabulary/courses/...`; kỳ vọng href `/practice/vocabulary/courses`, `/practice/vocabulary/libdeck-1?course=libcourse-1` |
| `apps/student/src/lib/legacy-vocab-redirect.test.ts` (mới) | case: `/vocab` → `/practice/vocabulary`; `/vocab/` → `/practice/vocabulary`; `/vocab/d1?course=c1` giữ query; `/vocab/d1/session?mode=review`; `/vocab/courses?q=IELTS`; `/vocab/courses/c1` |
| `apps/e2e/specs/student-class-detail.spec.ts` | bước "3. Từ vựng": click nav "Luyện tập" › "Vocabulary" thay "Từ vựng", URL `/practice/vocabulary`; assert không còn link nav "Từ vựng" |
| `apps/e2e/specs/vocab-hub-suggestion.spec.ts` | CHỈ phần student: URL `/vocab/$deckId` → `/practice/vocabulary/...`; phần teacher (`WEB_ORIGIN/vocab`) giữ nguyên |
| `apps/e2e/specs/vocab-srs.spec.ts` | `page.goto(STUDENT_ORIGIN/vocab)` → `/practice/vocabulary`; comment liên quan |
| `apps/e2e/specs/vocab-library-clone.spec.ts` | mọi regex `/vocab/courses...`, `/vocab/${deck}...`, `sessionUrl.pathname` → prefix `/practice/vocabulary`; thêm 1 assertion: `goto /vocab/courses?q=IELTS` → `toHaveURL(/\/practice\/vocabulary\/courses\?q=IELTS/)` (redirect legacy) |
| `apps/e2e/specs/student-practice.spec.ts` | thêm assert: `goto /practice/vocabulary` thấy `vocab-overview-page` (hub, không còn `practice-vocab-deck`) |

## Steps

1. Viết `legacy-vocab-redirect.test.ts` trước (đỏ nếu phase 1 chưa xong), chạy
   `pnpm --filter student test -- legacy-vocab-redirect`.
2. Sửa `vocab-course-catalog.test.tsx`; chạy `pnpm --filter student test`.
3. Sửa 5 e2e spec theo bảng; chạy các spec liên quan với port override:
   `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- vocab-srs vocab-library-clone vocab-hub-suggestion student-class-detail student-practice`.
4. Verify UI `/practice/vocabulary` ở 1440×900, 768×1024, 375×812 + keyboard focus
   (REVIEW.md); không overflow ngang; nav chỉ còn "Luyện tập › Vocabulary".
5. Full e2e suite trước khi merge vào `develop` (rebase lên `develop` mới nhất nếu đã di chuyển).

## Validation (mechanical)

- `pnpm check` exit 0; `pnpm check-types` exit 0.
- `pnpm --filter student test` exit 0.
- Full `pnpm --filter e2e e2e` exit 0.
- `grep -rn "practice-vocab-deck\|VocabPracticeCatalog" apps/` → rỗng.

## Risk

- Spec teacher bị sửa nhầm → review diff `vocab-hub-suggestion.spec.ts` chỉ chạm dòng
  có `STUDENT_ORIGIN` hoặc trang student.
