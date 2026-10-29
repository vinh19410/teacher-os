---
phase: 2
title: "Cập nhật unit test, e2e và verify UI 3 viewport"
status: completed
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
| `apps/student/test/student-nav.test.tsx` | cập nhật kỳ vọng `STUDENT_NAV[0].items` còn 6 mục (không còn `/vocab` riêng), giữ `/practice/vocabulary` trong children của `/practice` |
| `apps/e2e/specs/student-class-detail.spec.ts` | bước "3. Từ vựng": mở nhóm nav "Luyện tập" › click "Vocabulary" thay "Từ vựng", URL `/practice/vocabulary`, h1 `"Từ vựng"`; assert không còn link nav "Từ vựng" |
| `apps/e2e/specs/vocab-hub-suggestion.spec.ts` | CHỈ phần student: URL `/vocab/$deckId` → `/practice/vocabulary/...`; phần teacher (`WEB_ORIGIN/vocab`) giữ nguyên |
| `apps/e2e/specs/vocab-srs.spec.ts` | `page.goto(STUDENT_ORIGIN/vocab)` → `/practice/vocabulary`; comment liên quan |
| `apps/e2e/specs/vocab-library-clone.spec.ts` | mọi regex `/vocab/courses...`, `/vocab/${deck}...`, `sessionUrl.pathname` → prefix `/practice/vocabulary`; thêm 1 assertion: `goto /vocab/courses?q=IELTS` → `toHaveURL(/\/practice\/vocabulary\/courses\?q=IELTS/)` (redirect legacy) |
| `apps/e2e/specs/student-practice.spec.ts` | thêm assert: `goto /practice/vocabulary` thấy `vocab-overview-page` (hub, không còn `practice-vocab-deck`) |

## Steps

1. Viết `legacy-vocab-redirect.test.ts` trước (đỏ nếu phase 1 chưa xong), chạy
   `pnpm --filter student test -- legacy-vocab-redirect`.
2. Sửa `vocab-course-catalog.test.tsx` và `apps/student/test/student-nav.test.tsx`; chạy `pnpm --filter student test`. <!-- Updated: Red Team Session 1 - thêm student-nav.test.tsx -->
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

## Handover Tasks & Verification (`--advice`)

### Task 2.1 — Thêm unit test `legacy-vocab-redirect.test.ts` và cập nhật `vocab-course-catalog.test.tsx`, `student-nav.test.tsx`
- **Goal:** Toàn bộ unit test của `apps/student` pass với cấu trúc route và nav mới.
- **Target files and symbols:**
  - `apps/student/src/lib/legacy-vocab-redirect.test.ts`
  - `apps/student/src/components/vocab/vocab-course-catalog.test.tsx`
  - `apps/student/test/student-nav.test.tsx`
- **Steps:**
  1. Tạo `apps/student/src/lib/legacy-vocab-redirect.test.ts` kiểm tra các case `/vocab`, `/vocab/`, `/vocab/d1?course=c1`, `/vocab/d1/session?mode=review`, `/vocab/courses?q=IELTS`, `/vocab/courses/c1`, `/vocab//evil.com`, `/vocab/\\evil.com`, `/vocabX`, và `searchStr` không có `?`.
  2. Cập nhật import và href kỳ vọng trong `apps/student/src/components/vocab/vocab-course-catalog.test.tsx` sang `/practice/vocabulary/...`.
  3. Cập nhật `apps/student/test/student-nav.test.tsx`: bỏ kỳ vọng `ITEM_BY_HREF["/vocab"]`, kỳ vọng `ITEM_BY_HREF["/vocab"]` và `STUDENT_PAGE_LABEL.vocab` là `undefined`, giảm độ dài `STUDENT_NAV[0].items` từ 7 xuống 6.
- **Success criteria:** Toàn bộ vitest suite của `student` xanh, `pnpm check` và `pnpm check-types` xanh.
- **Verify:** `pnpm --filter student test && pnpm check && pnpm check-types` exits 0.

### Task 2.2 — Cập nhật 5 e2e spec và chạy kiểm chứng E2E + 3 viewport
- **Goal:** 5 spec e2e học viên cập nhật sang `/practice/vocabulary/*`, kiểm tra redirect `/vocab/courses?q=IELTS` và verify 3 viewport + full e2e suite xanh.
- **Target files and symbols:**
  - `apps/e2e/specs/student-class-detail.spec.ts`
  - `apps/e2e/specs/vocab-hub-suggestion.spec.ts`
  - `apps/e2e/specs/vocab-srs.spec.ts`
  - `apps/e2e/specs/vocab-library-clone.spec.ts`
  - `apps/e2e/specs/student-practice.spec.ts`
- **Steps:**
  1. Sửa `apps/e2e/specs/student-class-detail.spec.ts`: assert không còn link nav `"Từ vựng"`, mở button `"Luyện tập"` › click `"Vocabulary"`, kiểm tra URL `${STUDENT_ORIGIN}/practice/vocabulary`, `aria-expanded="true"`, breadcrumb `"Luyện tập"`, và heading level 1 `"Từ vựng"` (`exact: true`).
  2. Sửa `apps/e2e/specs/vocab-hub-suggestion.spec.ts` (chỉ phần student), `apps/e2e/specs/vocab-srs.spec.ts`, `apps/e2e/specs/vocab-library-clone.spec.ts` (kèm test redirect `/vocab/courses?q=IELTS`), và `apps/e2e/specs/student-practice.spec.ts` (kiểm tra redirect `/vocab` → `/practice/vocabulary` và render `vocab-overview-page`).
  3. Chạy 5 spec mục tiêu với port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`, sau đó chạy full e2e suite.
- **Success criteria:** Các spec mục tiêu và full e2e suite đều pass.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
