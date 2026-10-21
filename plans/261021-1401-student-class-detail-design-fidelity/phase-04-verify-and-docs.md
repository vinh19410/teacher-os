---
phase: 4
title: "Test, e2e, so ảnh, DESIGN.md"
status: pending
effort: "1h"
dependencies: [2, 3]
---

# Phase 4: Kiểm chứng và tài liệu

## Steps

1. `pnpm check && pnpm check-types && pnpm --filter student test`.
2. e2e (nhớ override cổng: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`): `pnpm --filter e2e e2e -- student-class-detail student-classmates`. Hook phải còn nguyên: `heading level 1 = tên lớp`, link `mailto:` email giáo viên, `heading "Buổi học"` + `aria-current="true"` ở buổi thứ hai, tab `Bài tập`, link `Làm bài: {tiêu đề}`, link `Trang chủ` (exact), `Về trang chủ` ở trạng thái không tìm thấy lớp.
3. Theo `memory/full-e2e-before-merge`: trước khi squash-merge vào `develop`, chạy full Playwright suite.
4. `pnpm design:compare --screens s-class-detail --side app --label fidelity` → ảnh mới trong `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/`; cập nhật dòng `s-class-detail` trong `verdict.md` (PASS + các khối bỏ vì thiếu dữ liệu).
5. Chụp keyboard focus (tab, nút "Làm ngay", link bài tập) theo `REVIEW.md`; PR đính kèm screenshot 3 viewport.
6. `DESIGN.md`: thêm mục lệch có chủ đích của trang chi tiết lớp (danh sách "Không có dữ liệu" ở `plan.md`).

## Rollback

Mỗi phase một commit; hoàn tác bằng `git revert`. Không có migration, không đổi API.
