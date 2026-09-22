---
title: "Phase 2: Tests — component test và e2e guards"
status: todo
---

# Phase 2: Tests — component test và e2e guards

## Context Links

- E2E chọn option theo label (sẽ vỡ): `apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts:98-99`, `apps/e2e/specs/syllabus-test-session-mark.spec.ts:146-147`
- Contract test quét source modal: `apps/web/src/lib/kernel-runtime.contract.test.ts:150-155`
- Pattern component test: `apps/web/src/components/ui/field.test.tsx` (Vitest + Testing Library, test nằm cạnh source)
- Playwright `selectOption({ label })` là exact match → label đổi là vỡ

## Overview

- **Priority**: P1
- **Status**: pending
- Bảo vệ tính năng bằng component test mới cho `AddClassModal` và cập nhật 2 e2e specs đang select template theo exact label.

## Key Insights

- Chỉ 2 chỗ trong e2e dùng "Template giáo trình" (đã grep toàn bộ `apps/e2e/specs`): 2 specs nêu trên. Các `selectOption` khác ("Thi giữa kỳ"...) không liên quan.
- `AddClassModal` lấy templates qua `useSyllabus()` — mock module `@/lib/repos/use-syllabus` là điểm mock duy nhất cho phần dữ liệu dropdown; các hook khác của modal mock theo pattern test hiện có.
- Specs e2e tạo template qua API nên có thể lấy `id` từ response/context để chuyển sang `selectOption({ value: id })` — robust hơn label.

## Requirements

- [ ] Component test `apps/web/src/components/modals/add-class-modal.test.tsx` phủ 4 case: option label chứa "· N kỹ năng"; chọn template có skills → Tag đúng tên từng skill; chọn template `skills: []` → text "Syllabus chưa khai báo kỹ năng"; chọn "— Lớp trống —" → không render hint.
- [ ] 2 e2e specs chuyển sang `selectOption({ value: <templateId> })` (hoặc exact label mới nếu id không khả dụng trong context spec).
- [ ] Không sửa `kernel-runtime.contract.test.ts` (phase 1 giữ nguyên các chuỗi regex).

## Architecture

Test ở 2 tầng: (1) Vitest RTL render `AddClassModal` với `useSyllabus` mock → assert label option và hint block theo selection; (2) Playwright chạy lại 2 specs bị ảnh hưởng sau khi đổi sang value-based selection.

## Related Code Files

- Create: `apps/web/src/components/modals/add-class-modal.test.tsx`
- Modify: `apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts`
- Modify: `apps/e2e/specs/syllabus-test-session-mark.spec.ts`

## Implementation Steps

1. Viết `add-class-modal.test.tsx`: mock `@/lib/repos/use-syllabus` (import tại dòng 17) trả 2 templates (một có `skills: ["Writing", "Speaking"]`, một `skills: []`), mock `@/lib/use-kernel-form-submit` (dùng tại dòng 58) và các hook còn lại mà modal cần để render (theo mẫu `field.test.tsx`).
2. Nếu mock toàn bộ modal quá nặng (kernel runtime, router), fallback được chấp nhận: extract helper thuần `formatTemplateOption(s)` vào modal và test trực tiếp helper + render hint bằng cách render `<Field>` con; ưu tiên vẫn là render full modal.
3. Đọc context 2 e2e specs, tìm template id trong scope (API response khi tạo template); đổi `selectOption({ label: "..." })` → `selectOption({ value: id })`. Nếu spec không giữ id, thêm biến lưu id lúc tạo template.
4. Chạy thứ tự: `pnpm --filter web test` → `pnpm check` → `pnpm --filter e2e e2e syllabus-detail-import-overwrite syllabus-test-session-mark` (chỉ 2 specs liên quan).

## Todo

- [ ] `add-class-modal.test.tsx` với 4 case yêu cầu
- [ ] 2 e2e specs chuyển sang value-based selection
- [ ] `pnpm --filter web test` pass
- [ ] `pnpm check` pass
- [ ] 2 e2e specs pass local (server + web đang chạy theo cấu hình Playwright hiện có)

## Success Criteria

Toàn bộ test web + contract test + 2 e2e specs pass; không có spec nào còn select template theo label text.

## Risk Assessment

- **Mock modal phức tạp** (modal phụ thuộc kernel command bus): fallback helper thuần đã nêu ở step 2; vẫn đạt mục tiêu assert logic label/hint.
- **Spec không có id template trong context**: đọc lại spec trước khi sửa — cả 2 đều tạo template ngay trong spec nên id gần như chắc chắn lấy được.
- **E2E flaky do môi trường**: chỉ chạy 2 specs liên quan bằng grep name, không chạy full suite trong phase này.

## Security Considerations

Không có thay đổi liên quan auth/data.

## Next Steps

Merge qua PR branch `vinh19410/feat/class-modal-syllabus-skills`; cân nhắc follow-up (non-goal hiện tại): custom listbox hiển thị Tag ngay trong menu mở.
