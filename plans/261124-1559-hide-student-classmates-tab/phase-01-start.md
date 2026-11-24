---
title: "Phase 1: Ẩn tab Bạn cùng lớp, cập nhật TDD tests và E2E"
status: todo
---

# Phase 1: Ẩn tab Bạn cùng lớp, cập nhật TDD tests và E2E

<!-- Updated: Validation Session 1 - Tách rõ renderToStaticMarkup vs render DOM, bổ sung kiểm chứng 3 tab + PII + dark/light + 320px reflow + E2E_LMS_PORT + student-class-detail.spec.ts -->

## Overview

Thực hiện theo chu trình TDD: cập nhật unit test kỳ vọng 3 tab (không có `"Bạn cùng lớp"`), gỡ tab khỏi `ClassDetailView`, cập nhật E2E spec `student-classmates.spec.ts`, chạy đầy đủ local gates (kèm `student-class-detail.spec.ts`) và chụp ảnh POT 3 viewport × 2 theme (`light`/`dark`) bằng công cụ độc lập không làm bẩn E2E spec.

## Files to Modify

- Modify: `apps/student/test/class-detail.test.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx`
- Modify: `apps/student/src/components/class/classmates-tab.tsx` (comment ngắn ghi rõ component được giữ nguyên để dễ bật lại)
- Modify: `apps/e2e/specs/student-classmates.spec.ts`

## Requirements

- [x] `CLASS_TABS` trong `apps/student/src/components/class/class-detail-view.tsx` chỉ còn 3 phần tử: `journey` (`"Hành trình học"`), `assignments` (`"Bài tập"`), `syllabus` (`"Giáo trình"`).
- [x] Không import hay render `ClassmatesTab` trong `ClassDetailView`.
- [x] Không ảnh hưởng chức năng 3 tab còn lại (`Hành trình học`, `Bài tập`, `Giáo trình`) và khả năng focus/kích hoạt bằng bàn phím (`Tab` + `Enter`/`Space`) trên `<button role="tab">`.
- [x] `apps/e2e/specs/student-classmates.spec.ts` gắn `page.on("request", ...)` trước khi vào lớp, xác nhận tab `"Bạn cùng lớp"` ẩn trên UI, không xuất hiện tên học viên cùng lớp (`mateName`/`invitedOnlyName`) hay `classmates-grid`/`classmate-card`, chuyển qua lại đủ 3 tab (`Bài tập`, `Giáo trình`, `Hành trình học`) hoạt động bình thường và không phát sinh request `/api/student/classes/*/classmates`.

## Test Matrix (TDD)

| Test Case | Target File | Cơ chế | Assertion |
|---|---|---|---|
| Default SSR markup chỉ có 3 tab, không có `"Bạn cùng lớp"` (TDD Red chính) | `apps/student/test/class-detail.test.tsx` | `renderToStaticMarkup` | `html` chứa 3 nhãn (`Hành trình học`, `Bài tập`, `Giáo trình`), không chứa `"Bạn cùng lớp"`, không chứa `class-tab-classmates` |
| DOM tablist chỉ có đúng 3 tab, chuyển đủ 3 tab không gọi `useClassmates` (TDD Red chính + regression guard) | `apps/student/test/class-detail.test.tsx` | `render(...)` (JSDOM) + `vi.spyOn(repos, "useClassmates")` | `screen.getAllByRole("tab")` có độ dài `3` với text `["Hành trình học", "Bài tập", "Giáo trình"]`, `screen.queryByRole("tab", { name: "Bạn cùng lớp" })` là `null`; bấm/focus qua `"Bài tập"`, `"Giáo trình"`, `"Hành trình học"` thì `useClassmatesSpy` có `toHaveBeenCalledTimes(0)` và `screen.queryByTestId("classmates-grid")` là `null` |
| 3 tab còn lại vẫn render nội dung đúng | `apps/student/test/class-detail.test.tsx` | `render(...)` | Tests hiện có cho tab `"Bài tập"` và `"Giáo trình"` tiếp tục pass |
| E2E ẩn tab `"Bạn cùng lớp"`, không lộ tên bạn học, không gọi `/classmates`, 3 tab còn lại hoạt động bình thường | `apps/e2e/specs/student-classmates.spec.ts` | Playwright | Gắn listener `page.on("request")` trước khi mở trang lớp → assert `getByRole("tab")` count `3`, `getByRole("tab", { name: "Bạn cùng lớp" })` count `0`, `getByTestId("class-tab-classmates")` count `0`, `classmates-grid`/`classmate-card` count `0`, body không chứa `mateName`/`invitedOnlyName`; click qua `"Bài tập"`, `"Giáo trình"` (thấy `"Buổi hôm qua"` / `"1/1 buổi"`), quay lại `"Hành trình học"`, kiểm tra focus bàn phím (`Tab` + `Enter`), và `classmatesRequests` có độ dài `0` |

## Implementation Steps

1. **Red (TDD):** Cập nhật `apps/student/test/class-detail.test.tsx`:
   - Cập nhật test `renderToStaticMarkup` (`:285-293`) sang mảng 3 nhãn + phủ định `"Bạn cùng lớp"` và `class-tab-classmates`.
   - Import `* as repos from "@/lib/repos/student"` và thêm test `render(...)` JSDOM kiểm tra `getAllByRole("tab")` đúng 3 nhãn, `queryByRole("tab", { name: "Bạn cùng lớp" }) === null`, click lần lượt 3 tab và xác nhận `useClassmates` không được gọi (`toHaveBeenCalledTimes(0)`).
   - Chạy `pnpm --filter student test test/class-detail.test.tsx` xác nhận fail đúng lý do (còn tab `"Bạn cùng lớp"` / 4 tab).
2. **Green:**
   - Sửa `apps/student/src/components/class/class-detail-view.tsx`: xóa import `ClassmatesTab` (`:23`), xóa `{ id: "classmates", label: "Bạn cùng lớp" }` khỏi `CLASS_TABS` (`:54`), xóa `{tab === "classmates" && <ClassmatesTab classId={cls.id} />}` (`:371`).
   - Thêm comment ngắn ở đầu `ClassmatesTab` (`apps/student/src/components/class/classmates-tab.tsx`) ghi rõ tab đang tạm ẩn trên UI và giữ component/API để dễ bật lại.
   - Chạy lại `pnpm --filter student test test/class-detail.test.tsx` xác nhận pass xanh.
3. **E2E alignment:** Cập nhật `apps/e2e/specs/student-classmates.spec.ts` theo Test Matrix (gắn network listener trước khi vào trang lớp, assert 3 tab / 0 tab classmates / không lộ `mateName` & `invitedOnlyName` / click đủ 3 tab + kiểm tra keyboard focus / 0 request `/classmates`). Tuyệt đối không đặt `page.screenshot` ghi vào `plans/reports/` bên trong file spec.
4. **Verification & POT (REVIEW.md / AGENTS.md):**
   - Chạy `pnpm exec biome check .`
   - Chạy `pnpm check-types`
   - Chạy `pnpm --filter student test` và `pnpm --filter server test`
   - Chạy 2 E2E spec lẻ liên quan:
     `E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_WEB_PORT=8101 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/student-classmates.spec.ts specs/student-class-detail.spec.ts`
   - Kiểm chứng UI 3 viewport (`1440×900`, `768×1024`, `375×812`) + `320px` reflow (`scrollWidth <= clientWidth`), light + dark theme, keyboard focus bằng script độc lập (hoặc `design:compare` cho màn `s-class-detail`) trên dữ liệu seed/E2E sạch PII, lưu ảnh POT vào `plans/reports/` theo quy ước `plans/reports/<issue>-hide-classmates-tab-<viewport>-<theme>.png`.

## Todo

- [x] Cập nhật unit test `apps/student/test/class-detail.test.tsx` (TDD Red)
- [x] Gỡ tab `"Bạn cùng lớp"` khỏi `apps/student/src/components/class/class-detail-view.tsx` và ghi chú ở `classmates-tab.tsx` (TDD Green)
- [x] Cập nhật `apps/e2e/specs/student-classmates.spec.ts`
- [x] Chạy toàn bộ local gates (`biome`, `check-types`, unit tests, 2 E2E specs lẻ)
- [x] Kiểm chứng 3 viewport + 320px reflow + light/dark + keyboard focus và lưu ảnh POT vào `plans/reports/`

## Success Criteria

- Toàn bộ unit test, typecheck, biome lint và 2 E2E spec lẻ (`student-classmates.spec.ts`, `student-class-detail.spec.ts`) đều pass 100%.
- Ảnh POT 3 viewport + dark theme (dữ liệu seed sạch PII) xác nhận thanh tab trang chi tiết lớp học viên chỉ còn đúng 3 tab (`Hành trình học`, `Bài tập`, `Giáo trình`), không tràn ngang ở 320px và không còn `"Bạn cùng lớp"`.
