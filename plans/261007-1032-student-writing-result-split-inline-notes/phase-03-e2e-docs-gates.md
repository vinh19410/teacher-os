---
phase: 3
title: "E2E + CHANGELOG + gate cuối"
status: completed
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
   - Khi giáo viên chấm (POST grade trong spec): gửi `feedback` dài (vài trăm ký tự, nhiều dòng) để card tràn `max-h` — phục vụ assertion cuộn ở dưới.
   - Kiểm bố cục ở viewport mặc định của Playwright (1280×720, `playwright.config.ts` không đặt viewport; ≥ 921px):
     - Cặp ý nghĩa "đỉnh thẳng hàng": `boundingBox().y` của `h2#essay-heading` ≈ `y` của `attempt-grade` (chênh ≤ 4px — so heading với card border, không so biên section).
     - Khung trái đủ rộng (`max-w-[1120px]` có hiệu lực, không bị nhồi vào 720px): `boundingBox().width` của `essay-frame` ≥ 500px.
     - Hai khung cùng hàng: `x` của `essay-frame` nhỏ hơn `x` của `attempt-grade`.
   - **Sticky (bảo vệ Success Criteria #1):** essay seed phải dài hơn viewport (mở rộng essay trong step seed của spec); `window.scrollTo(0, document.body.scrollHeight)` rồi assert `boundingBox().y` của `attempt-grade` ≈ 80px (`top-20` = 5rem) và không đổi trước/sau khi cuộn. Assertion này là guard duy nhất chống `sticky` chết vì ancestor thêm `overflow`.
   - **Card cuộn được (feedback dài):** `evaluate` trên `attempt-grade`: `scrollHeight > clientHeight` và `clientHeight <= window.innerHeight - 96` (`max-h` hiệu lực); Tab tới card rồi `ArrowDown` cuộn được nội dung (scrollTop tăng).
   - Đặt `studentPage.setViewportSize({ width: 960, height: 900 })` (dải hẹp nhất ≥ 921px — snap nửa màn hình 1920): `document.documentElement.scrollWidth <= window.innerWidth` (không tràn ngang khi cột phải chỉ ~360px).
   - Đặt `studentPage.setViewportSize({ width: 375, height: 812 })` rồi kiểm `attempt-grade` nằm dưới `essay-frame` (`y` lớn hơn `y + height` của bài viết).
2. **CHANGELOG.md:** thêm vào mục `## 2026-10-07` (hoặc ngày merge thực tế) nhóm `### Changed`: "Màn kết quả học viên: bài Writing đã chấm hiện 2 khung (bài viết | kết quả chấm, khung phải dính khi cuộn); ghi chú của giáo viên hiện ngay sau đoạn được highlight thay cho danh sách riêng dưới bài (#336)".
3. **Gate cuối** (CI không chạy cho `develop`, theo `AGENTS.md`):
   - `pnpm check`
   - `pnpm check-types`
   - `pnpm --filter web test`
   - `pnpm --filter student test`
   - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- teacher-essay-annotations student-quiz-take-review teacher-grade-submission`
4. **Screenshot cho PR:** màn kết quả Writing đã chấm có highlight ở 1440×900, 960×900 (dải hẹp), 768×1024, 375×812 (theo `REVIEW.md`), kèm 1 ảnh trang chấm giáo viên chứng minh không đổi.

## Verification

- Tất cả lệnh ở bước 3 xanh; dán output tóm tắt vào PR body.
- `grep -rn "essay-annotation-list" apps` chỉ còn các dòng `toHaveCount(0)` trong e2e.
