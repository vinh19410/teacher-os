---
phase: 3
title: "E2E + CHANGELOG + gate cuối"
status: pending
priority: P2
effort: "1.5h"
dependencies: [2]
---

# Phase 3: E2E + CHANGELOG + gate cuối

## Goal

E2E khẳng định ghi chú inline và bố cục 2 khung ở màn học viên, CHANGELOG ghi thay đổi, toàn bộ gate local xanh.

## Files to Create / Modify

- Modify: `apps/e2e/specs/teacher-essay-annotations.spec.ts`
- Modify: `CHANGELOG.md`

## Tasks & Steps

1. **E2E `student sees highlights only after the attempt is graded`** (`teacher-essay-annotations.spec.ts` khoảng dòng 197-242):
   - Trước khi chấm: thay `getByTestId("essay-annotation-list")` bằng `getByTestId("essay-inline-note")` → `toHaveCount(0)`; thêm `getByTestId("writing-result-split")` → `toHaveCount(0)`.
   - Sau khi chấm + reload: thay khối `noteList` bằng kiểm ghi chú nằm ngay sau highlight:
     ```ts
     await expect(
       studentPage.locator('mark[data-n="1"] + [data-testid="essay-inline-note"]'),
     ).toContainText("Dùng 'advantages' cho đa dạng.");
     await expect(
       studentPage.locator('mark[data-n="2"] + [data-testid="essay-inline-note"]'),
     ).toContainText("Từ hay.");
     await expect(studentPage.getByTestId("essay-annotation-list")).toHaveCount(0);
     ```
     (Đã đối chiếu seed: highlight 1 = "benefits" có ghi chú "Dùng 'advantages'…", highlight 2 = "plentiful" có "Từ hay.", dòng 143-181.)
   - Kiểm bố cục ở viewport mặc định của Playwright (1280×720, `playwright.config.ts` không đặt viewport; ≥ 921px): `boundingBox()` của `essay-frame` có `x` nhỏ hơn của `attempt-grade` và hai khung cùng hàng (chênh `y` < 40px).
   - Đặt `studentPage.setViewportSize({ width: 375, height: 812 })` rồi kiểm `attempt-grade` nằm dưới `essay-frame` (`y` lớn hơn `y + height` của bài viết).
2. **CHANGELOG.md:** thêm vào mục `## 2026-10-07` (hoặc ngày merge thực tế) nhóm `### Changed`: "Màn kết quả học viên: bài Writing đã chấm hiện 2 khung (bài viết | kết quả chấm, khung phải dính khi cuộn); ghi chú của giáo viên hiện ngay sau đoạn được highlight thay cho danh sách riêng dưới bài (#336)".
3. **Gate cuối** (CI không chạy cho `develop`, theo `AGENTS.md`):
   - `pnpm check`
   - `pnpm check-types`
   - `pnpm --filter web test`
   - `pnpm --filter student test`
   - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- teacher-essay-annotations student-quiz-take-review teacher-grade-submission`
4. **Screenshot cho PR:** màn kết quả Writing đã chấm có highlight ở 1440×900, 768×1024, 375×812 (theo `REVIEW.md`), kèm 1 ảnh trang chấm giáo viên chứng minh không đổi.

## Verification

- Tất cả lệnh ở bước 3 xanh; dán output tóm tắt vào PR body.
- `grep -rn "essay-annotation-list" apps` chỉ còn các dòng `toHaveCount(0)` trong e2e.
