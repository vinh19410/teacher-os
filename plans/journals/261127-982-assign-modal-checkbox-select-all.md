# Journal: Sửa lỗi checkbox bị `span` chặn click và nâng cấp «Chọn tất cả» 3 trạng thái trong `AssignClassPromptModal` (#982)

- **Date:** 2026-11-27 17:41 (Europe/London)
- **Severity:** Low
- **Issue:** [#982](https://github.com/vinh19410/teacher-os/issues/982) — `Hộp thoại giao bài mặc định chọn hết học viên; bấm checkbox bị chặn bởi span đè lên`
- **Branch:** `vinh19410/h-p-tho-i-giao-b-i-m-c-nh-ch-n-h-t-h-c-vi-n-b-m`
- **Plan:** `plans/261127-1701-982-fix-assign-modal-checkbox-select-all/plan.md`
- **Component:** `AssignClassPromptModal` — Teacher Class Detail (`apps/web`, `apps/e2e`, `CHANGELOG.md`)
- **Status:** Resolved

## Bối cảnh & Thay đổi đã giao

Trên hộp thoại giao bài tập (`AssignClassPromptModal`, `apps/web/src/components/classes/assign-class-prompt-modal.tsx`), người dùng và trình kiểm thử không thể bấm trực tiếp vào ô checkbox học viên vì `<input type="checkbox" className="peer sr-only" />` bị `<span aria-hidden="true">` kích thước `size-4` (không có `pointer-events-none`) đè lên. Ngoài ra `<Avatar>` nằm trong `<label>` không có `aria-hidden="true"` làm tên truy cập checkbox bị dính chữ viết tắt (ví dụ `"NA Nguyễn Văn A"`), và nút `"Bỏ chọn tất cả"` / `"Chọn tất cả"` chỉ là `<button>` chữ xám mờ nhạt thiếu ngữ nghĩa checkbox 3 trạng thái.

Thay đổi đã triển khai:
- **`apps/web/src/components/classes/assign-class-prompt-modal.tsx`:** Thay cặp `peer sr-only` + decorative `<span>` bằng native `<input type="checkbox">` 16×16px hiển thị trực tiếp (`appearance-none`, token `--input`/`--primary`, `focus-visible:shadow-[var(--focus-ring)]`, `forced-colors:appearance-auto`) kèm `<Check>` / `<Minus>` có `pointer-events-none aria-hidden="true"`; bọc `<Avatar>` trong `<span aria-hidden="true" className="shrink-0">` để tên truy cập checkbox chỉ còn `s.name`; nâng cấp thanh đầu danh sách học viên thành header cố định với checkbox 3 trạng thái `"Chọn tất cả"` (`selectAllRef` sync `indeterminate` + `aria-checked="mixed"`), badge phạm vi `data-testid="assign-students-scope-badge"` (`"Cả lớp"` chỉ khi `willAssignWholeClass === true`, `"Chưa chọn"` khi `0`, `"Chọn lọc"` khi bán phần hoặc lớp `> 100` HV), `<fieldset aria-labelledby="assignment-students-heading">` và một vùng `aria-live="polite" aria-atomic="true"` duy nhất.
- **`apps/web/src/components/classes/assign-class-prompt-modal.test.tsx`:** Cập nhật test lớp 105 HV và bổ sung test TDD xác minh direct checkbox (không `sr-only`, SVG `pointer-events-none`), accessible name sạch không dính Avatar và luồng chuyển 3 trạng thái của `"Chọn tất cả"` (bao gồm reset khi mở lại modal).
- **`apps/e2e/specs/class-assign.spec.ts`:** Bổ sung kịch bản E2E `#982` kiểm chứng `document.elementFromPoint` tại tâm checkbox trả về `INPUT` (`type === "checkbox"`), `.uncheck()` không `{ force: true }`, bàn phím `Tab` + `Space`, reflow `320px/375px/768px/1440px` cả Light & Dark, chụp 6 ảnh POT (`CAPTURE_POT_982=1`) dùng `fileURLToPath`, và kiểm tra giao chọn lọc (`targetScope: "selected"`, `.sub-row`, `assign-missing-students-*`).

## Quyết định kỹ thuật & Đánh đổi

1. **Giữ mặc định chọn toàn bộ học viên đang học (Option A) thay vì mặc định bỏ chọn tất cả (Option B):**
   - *Quyết định qua `ask_question`:* Giữ fast-path giao bài cả lớp, bảo toàn cơ chế tự bù học viên chờ xác nhận `#958` (`targetScope: "class"`) và 6 E2E spec hiện có, đồng thời khắc phục triệt để rủi ro giao nhầm bằng thanh `"Chọn tất cả"` 3 trạng thái nổi bật + badge `"Cả lớp"` / `"Chọn lọc"` / `"Chưa chọn"`.
2. **Dùng native `<input type="checkbox" appearance-none>` + `forced-colors:appearance-auto` thay cho `@teacher-os/ui` `Checkbox` (`@base-ui/react/checkbox`):**
   - *Lý do:* Component Base UI render `<span role="checkbox">` (`rounded-none`, thiếu icon `indeterminate` và không có `.disabled` native trên DOM element), trong khi native `<input>` giữ trọn ngữ nghĩa DOM/AT/Playwright, token `--input`/`--primary` và `--focus-ring` của `DESIGN.md`.

## Chi tiết kỹ thuật & Điểm vướng đã xử lý

- **Thứ tự kiểm tra `actionState` (`!promptOk` trước `!studentsOk`):** Khi chưa chọn đề, footer luôn hiển thị `"Chưa chọn đề"` kể cả khi danh sách học viên là `0/N`. Cần chọn một đề `ready` trước khi assert `"Chưa chọn học viên"` và nút `"Giao bài tập"` bị `disabled`.
- **Banner thiếu học viên `#958` nằm trong `.sub-list`:** `ClassAssignmentsTab` hiển thị `"Còn 1 học viên chưa được giao: <tên>"` ngay dưới `.sub-row` bên trong `#assigned-list`. Assertion E2E cho giao chọn lọc phải scope vào `#assigned-list .sub-row` và kiểm riêng `[data-testid^="assign-missing-students-"]`.
- **Khác biệt Testing Library vs Playwright & TypeScript CFA:** `@testing-library/dom` `ByRoleOptions` không nhận `exact: true` (string `name` mặc định đã match chính xác), và TypeScript CFA không theo dõi gán biến `let` bên trong callback `page.waitForResponse` — giải quyết bằng đọc `createRes.request().postDataJSON()` sau `await createResPromise`.
- **Transient blank frame ở `design:compare`:** Lần chạy đầu báo `Ảnh chụp trắng/rỗng` ở `t-class-detail/desktop-light`; chạy lại đúng hướng dẫn `AGENTS.md` đạt `18 ảnh, 0 lỗi` và đã khôi phục ảnh lịch sử `t-class-detail`.

## Kiểm chứng

- `pnpm exec biome check .` (0 errors across 2642 files)
- `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` (14/14 turbo packages pass)
- `CI=1 pnpm --filter web test` (224 files, 2593 tests pass)
- Targeted E2E `apps/e2e/specs/class-assign.spec.ts` (ports 8100–8105, `4 passed`)
- `pnpm design:compare --screens t-class-detail --force` (`18 ảnh, 0 lỗi`) + 6 ảnh POT (`plans/reports/982-assign-modal-*.png`)

## Bước tiếp theo

- Hoàn tất local code review, đẩy nhánh lên remote và mở Beta PR vào `develop` với `--advice`.
- Sau khi PR merge và CI/deploy staging trên `develop` xanh, chạy `kongming` post-CI assessment và đăng bình luận POT lên issue `#982`.
