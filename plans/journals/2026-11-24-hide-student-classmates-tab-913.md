# 2026-11-24 — Ẩn tab "Bạn cùng lớp" trên trang chi tiết lớp học viên (#913)

- **Issue:** #913
- **Plan:** `plans/261124-1559-hide-student-classmates-tab/plan.md`
- **Branch:** `vinh19410/Remove-tab-bạn-cùng-lớp`

## Tóm tắt kỹ thuật
- Gỡ mục `{ id: "classmates", label: "Bạn cùng lớp" }` khỏi `CLASS_TABS`, gỡ import và nhánh render `<ClassmatesTab>` trong `apps/student/src/components/class/class-detail-view.tsx`.
- Giữ nguyên backend `GET /api/student/classes/:classId/classmates`, contract `ClassmatesResponse`, `useClassmates` và `ClassmatesTab` (+ ghi chú trong `classmates-tab.tsx`) theo quyết định đã xác nhận để dễ bật lại sau, đồng thời ghi rõ giới hạn trust boundary (chỉ ẩn UI).
- Đồng bộ TDD unit test (`apps/student/test/class-detail.test.tsx`) và E2E spec (`apps/e2e/specs/student-classmates.spec.ts`: 3 tab, không lộ tên học viên khác, 0 request `/classmates`, điều hướng `Tab` + `Enter`).
- Lưu ý môi trường: `pnpm design:compare` hiện gặp lỗi pre-existing do `capture.mjs` chờ `/login` trên cổng `student` cũ trong khi `student` đã chuyển base path `/student/`; đã kiểm chứng độc lập bằng Playwright trên `lms serve` (3 viewport + `320px` reflow + light/dark, 4 ảnh POT lưu tại `plans/reports/913-hide-classmates-tab-*.png`).
