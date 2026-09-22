---
title: "Phase 2: Tests — component test và e2e guards"
status: done
---

# Phase 2: Tests — component test và e2e guards

## Context Links

- E2E chọn option theo label (sẽ vỡ): `syllabus-detail-import-overwrite.spec.ts` dùng `"E2E Template Copy Guard"`; `syllabus-test-session-mark.spec.ts` dùng `"E2E Buổi Thi Guard"`. Không phải cùng một chuỗi.
- Contract test quét source modal: `apps/web/src/lib/kernel-runtime.contract.test.ts:150-155`
- Pattern component test: `apps/web/src/components/ui/field.test.tsx` dùng `renderToStaticMarkup` trên Vitest `environment: "node"`. Web không có `@testing-library/react`. Không thêm dependency để click select.
- Playwright `selectOption({ label })` là exact match → label đổi là vỡ

## Overview

- **Priority**: P1
- **Status**: done
- Bảo vệ tính năng bằng component test mới cho `AddClassModal` và cập nhật 2 e2e specs đang select template theo exact label.

## Key Insights

- Chỉ 2 chỗ trong e2e dùng "Template giáo trình" (đã grep toàn bộ `apps/e2e/specs`): 2 specs nêu trên. Các `selectOption` khác ("Thi giữa kỳ"...) không liên quan.
- `AddClassModal` lấy templates qua `useSyllabus()` — mock module `@/lib/repos/use-syllabus` là điểm mock duy nhất cho phần dữ liệu dropdown; các hook khác của modal mock theo pattern test hiện có.
- Specs e2e tạo template qua API nên có thể lấy `id` từ response/context để chuyển sang `selectOption({ value: id })` — robust hơn label.

## Requirements

- [x] Component test `apps/web/src/components/modals/add-class-modal.test.tsx` render đúng khối picker (cùng component modal dùng) bằng `renderToStaticMarkup` cho 4 trạng thái: option label `Tên · N kỹ năng`; template có skills → nhãn "Kỹ năng giáo trình" + Tag từng tên, và `label for` vẫn trùng `select id`; template `skills: []` → "Syllabus chưa khai báo kỹ năng"; "— Lớp trống —" → không hint. Modal đầy đủ (mock `useSyllabus` + `useKernelFormSubmit`) xác nhận option label và chip lớp vẫn `aria-pressed="false"`.
- [x] 2 e2e specs chuyển sang `selectOption({ value })`. Id là segment URL sau `waitForURL(/\/syllabus\/.+/)` trong `createSyllabusTemplate`, trả về trước `goto("/classes")`. Không dùng id bản copy `classId !== null` (dropdown chỉ liệt kê template `classId === null`).
- [x] Không sửa `kernel-runtime.contract.test.ts` (phase 1 giữ nguyên các chuỗi regex).

## Architecture

Test ở 2 tầng: (1) Vitest RTL render `AddClassModal` với `useSyllabus` mock → assert label option và hint block theo selection; (2) Playwright chạy lại 2 specs bị ảnh hưởng sau khi đổi sang value-based selection.

## Related Code Files

- Create: `apps/web/src/components/modals/add-class-modal.test.tsx`
- Modify: `apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts`
- Modify: `apps/e2e/specs/syllabus-test-session-mark.spec.ts`

## Implementation Steps

1. Tách khối picker trong `add-class-modal.tsx` (Select vẫn là child duy nhất của Field; hint là sibling). Test picker bằng `renderToStaticMarkup` cho 4 trạng thái, gồm cả `label for` === `select id` khi đã chọn template. Render thêm `AddClassModal` với mock `useSyllabus` và `useKernelFormSubmit` để khóa option label trên modal thật và chip lớp không bị bật sẵn.
2. Sửa `createSyllabusTemplate` ở cả 2 spec để trả id từ URL `/syllabus/:id`. Đổi `selectOption({ label: "E2E Template Copy Guard" })` và `selectOption({ label: "E2E Buổi Thi Guard" })` sang `selectOption({ value: templateId })`.
3. Chạy `pnpm --filter web test` rồi `pnpm check`. E2E chỉ 2 spec. Playwright `reuseExistingServer: false`; nếu 8000/8001 đang bận thì đặt `E2E_API_PORT` / `E2E_WEB_PORT` sang cổng trống, không tắt dev server của người dùng và không bám server đó.

## Todo

- [x] `add-class-modal.test.tsx` với 4 trạng thái picker + association label
- [x] 2 e2e specs chọn theo id template từ URL
- [x] `pnpm --filter web test` pass
- [x] `pnpm check` pass
- [x] 2 e2e specs pass local (server + web đang chạy theo cấu hình Playwright hiện có)

## Success Criteria

Toàn bộ test web + contract test + 2 e2e specs pass; không có spec nào còn select template theo label text.

## Risk Assessment

- **Mock modal phức tạp:** picker thuần nhận `templateId` nên 4 trạng thái hint không cần click. Modal đầy đủ chỉ cần mock hai hook.
- **Id trong spec sau submit là bản copy:** lấy id template từ URL lúc tạo, trước khi rời trang detail.
- **Cổng 8000/8001 bận:** Playwright không reuse server. Dùng `E2E_API_PORT` / `E2E_WEB_PORT` nếu cổng mặc định đang có dev server.

## Security Considerations

Không có thay đổi liên quan auth/data.

## Next Steps

Merge qua PR branch `vinh19410/feat/class-modal-syllabus-skills`; cân nhắc follow-up (non-goal hiện tại): custom listbox hiển thị Tag ngay trong menu mở.
