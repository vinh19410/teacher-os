---
phase: 1
title: "Thẻ Giáo trình thu gọn thành gán template"
status: todo
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Thẻ Giáo trình thu gọn thành gán template

## Overview

Biến `CurriculumManagementSection` từ "thẻ tiến độ + cây nội dung có reorder" thành thẻ gán giáo trình thuần: khi lớp có bản sao → tên + meta + nút "Gỡ giáo trình"; khi trống → "Nhập từ template"; con trỏ lệch legacy → gỡ con trỏ. Không còn %, `x/y buổi`, Progress bar, "Mở rộng/Thu gọn", cây module/buổi.

## Context

- File chính: `apps/web/src/components/class-detail/curriculum-management-section.tsx` (369 dòng hiện tại)
- Caller duy nhất: `apps/web/src/routes/_auth/classes/$classId.tsx:278-287` (truyền `collapsible` + `defaultCollapsed`)
- Contract test pin hành vi cũ: `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts:51-57` (pin `collapsible`, `defaultCollapsed`, `aria-expanded`, "Mở rộng", "Thu gọn") — phải viết lại
- Pin runtime: `apps/web/src/lib/kernel-runtime.contract.test.ts:329-333` (file phải chứa `disabled={busy}`, không chứa `useDirectKernelAction`) và `:592-595` (không chứa `showKind`)
- E2E duy nhất phụ thuộc nút mở rộng: `apps/e2e/specs/syllabus-test-session-mark.spec.ts:169` (Phase 2 xử lý; Phase 1 không chạy riêng spec này)

## Files to Create / Modify

- Modify: `apps/web/src/components/class-detail/curriculum-management-section.tsx` — thu gọn
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — bỏ 2 props collapse
- Modify: `apps/web/src/lib/class-detail-sessions-tab.contract.test.ts` — viết lại test thẻ
- Không tạo/xóa file nào trong phase này (cây + modal dời sang Phase 2)

## Implementation Steps

1. **Thu gọn nhánh "có bản sao"** (`sy.classId === cls.id`): giữ Card với tên `sy.name` + dòng meta (`level · skills · totalLessons buổi` — tổng static, không phải tiến độ). Xóa: khối `syPct`/`syDone`/`syLessons` (lines 77-80), số % + `x/y buổi` (125-132), `<Progress>` (134), nút Mở rộng/Thu gọn (93-115), state `isCollapsed`.
2. **Giữ nguyên 3 nhánh render** khác: empty state "Nhập từ template" (264-277), con trỏ lệch legacy (278-295), `ImportSyllabusModal` + modal confirm "Gỡ giáo trình" (297-339).
3. Nút "Gỡ giáo trình" trên Card (thay cho vị trí cũ trong header cây): `variant="secondary" size="sm"` với `disabled={busy}` nguyên văn — giữ pin `kernel-runtime.contract.test.ts:332`.
4. Xóa khỏi file: toàn bộ cây module/buổi (136-262), state `addModuleOpen`/`editModuleId`/`addLessonModuleId`/`editLessonRef`, `useSyllabusMutations`, imports không dùng (`Progress`, `ChevronDown/ChevronRight`, `SectionLabel`, `LessonStatusBadge`/`lessonDotClassFor`, `SyllabusMutationButtons`, 4 modal Add/Edit Module/Lesson). Props `collapsible`/`defaultCollapsed` xóa khỏi interface.
5. **`$classId.tsx`**: bỏ `collapsible` + `defaultCollapsed` khỏi `<CurriculumManagementSection>` (278-287).
6. **Viết lại contract test** `class-detail-sessions-tab.contract.test.ts:51-57` → "CurriculumManagementSection renders assignment-only card": pin positive `ImportSyllabusModal`, `Gỡ giáo trình`, `Nhập từ template`; pin negative `Mở rộng`, `Thu gọn`, `collapsible`, `syPct`, `<Progress`. Giữ nguyên các test khác của file.
7. Chạy gate: `pnpm --filter web test` → `pnpm -w run check-types` → `pnpm -w run check` (biome).

## Todo

- [ ] Thẻ thu gọn: bỏ %, x/y buổi, Progress, Mở rộng/Thu gọn, cây module/buổi
- [ ] Giữ 3 nhánh render + confirm "Gỡ giáo trình" với `disabled={busy}`
- [ ] `$classId.tsx` bỏ props collapse; file < 500 dòng (hiện 348)
- [ ] Contract test viết lại + xanh
- [ ] `pnpm --filter web test` + `pnpm -w run check-types` + `pnpm -w run check` xanh toàn bộ

## Success Criteria

- Tab Buổi học: thẻ Giáo trình chỉ còn tên template + meta + "Gỡ giáo trình" (hoặc empty state "Nhập từ template")
- grep file thẻ: không còn `syPct`/`Progress`/`Mở rộng`/`collapsible`
- `pnpm --filter web test` exit 0 (chấp nhận spec e2e chưa chạy — Phase 2)

## Risk Assessment

- **Pin contract cũ sót lại** → lỗi test rõ ràng, chỉ cần viết lại đúng tên test; không có rủi ro runtime ẩn.
- **Quên import thừa** → biome/tsc báo unused ngay ở gate của bước 7.
- **Regression ở trang khác**: component chỉ được dùng ở `$classId.tsx` (đã verify bằng grep) — không caller thứ hai.

## Security Considerations

- Không đổi action/endpoint; "Gỡ giáo trình" vẫn qua confirm modal + `remove-curriculum` hiện có (scope theo `orgId` phía server).
