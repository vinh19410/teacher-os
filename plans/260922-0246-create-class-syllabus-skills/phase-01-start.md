---
title: "Phase 1: UI — hiển thị kỹ năng của syllabus trong modal tạo lớp"
status: todo
---

# Phase 1: UI — hiển thị kỹ năng của syllabus trong modal tạo lớp

## Context Links

- Scout report: đoạn dropdown được verify trực tiếp tại `apps/web/src/components/modals/add-class-modal.tsx:212-224`
- Pattern Tag skills: `apps/web/src/routes/_auth/syllabus/index.tsx:100-106`
- Contract test ràng buộc: `apps/web/src/lib/kernel-runtime.contract.test.ts:150-155`
- Native Select base: `apps/web/src/components/ui/field.tsx:101-112`

## Overview

- **Priority**: P1
- **Status**: pending
- Sửa rendering của dropdown "Template giáo trình" trong `AddClassModal`: option label thêm count kỹ năng, thêm hàng Tag kỹ năng dưới dropdown cho template đang chọn. Không đổi data flow, không đổi backend.

## Key Insights

- `useSyllabus().templates` (dòng 42 của modal) đã trả về `Syllabus` với `skills: string[]`, `totalLessons` — dữ liệu đủ, không cần fetch thêm.
- Native `<option>` không style được; text option quá dài sẽ truncate tùy OS. Do đó count vào option, tên skills vào hàng Tag bên dưới (thấy ngay khi duyệt selection, không cần submit).
- Modal đang giữ `templateId` state; derived value `selectedTemplate = templates.find((s) => s.id === templateId)` là đủ, không thêm state mới.

## Requirements

- [ ] Option label dạng `${s.name} · ${s.skills.length} kỹ năng` cho mọi template.
- [ ] Khi `selectedTemplate` tồn tại và `skills.length > 0`: render mỗi skill một `<Tag>` (import từ `@/components/ui/tag`), bọc trong `div` flex-wrap ngay dưới `<Select>` trong cùng `<Field>`.
- [ ] Khi `selectedTemplate` tồn tại và `skills.length === 0`: render `<p className="text-muted-fg text-sm">` "Syllabus chưa khai báo kỹ năng".
- [ ] Khi `templateId === ""` ("— Lớp trống —"): không render hàng thông tin nào.
- [ ] Giữ nguyên chuỗi `<Field label="Template giáo trình">`, payload `templateId,` và `setTemplateId("")` để không vỡ contract test.

## Architecture

Một chiều đơn giản trong component: `templates` (đã có) → `selectedTemplate` (derived) → (a) option labels trong `<Select>`, (b) hàng hint dưới `<Select>`. Không thêm state, không thêm API call, không đụng store/kernel.

## Related Code Files

- Modify: `apps/web/src/components/modals/add-class-modal.tsx` (thêm import `Tag`, derived `selectedTemplate`, option label, hint block)

## Implementation Steps

1. Thêm `import { Tag } from "@/components/ui/tag";` vào đầu file.
2. Trong component, sau các state declarations, thêm `const selectedTemplate = templates.find((s) => s.id === templateId);`.
3. Sửa option trong `templates.map` (dòng ~218-222): `<option key={s.id} value={s.id}>{s.name} · {s.skills.length} kỹ năng</option>`.
4. Ngay sau `</Select>` trong `<Field label="Template giáo trình">`, thêm khối hint theo Requirements (Tag list / empty text / không render).
5. Chạy `pnpm --filter web test` và `pnpm check`; sửa vi phạm nếu có.

## Todo

- [ ] Import Tag + derived `selectedTemplate`
- [ ] Option label `Tên · N kỹ năng`
- [ ] Hint block: Tag skills / empty text / ẩn khi lớp trống
- [ ] `pnpm --filter web test` pass (contract test giữ nguyên không cần sửa)
- [ ] `pnpm check` (Biome) pass

## Success Criteria

Modal render đúng 3 trạng thái hint (có skills / rỗng / lớp trống), option label có count, toàn bộ test web pass mà không cần sửa contract test.

## Risk Assessment

- **Option text dài gây wrap/truncate ở một số OS**: đã giảm bằng cách chỉ đưa count vào option (tên skills nằm ở hàng Tag).
- **Quên trường hợp `skills: []`** (template legacy có cột `skill` số ít được fallback ở `mapSyllabi`): đã có requirement xử lý rỗng.
- **Vỡ contract test regex**: mitigation là giữ nguyên 3 chuỗi đã liệt kê; verification bằng chính contract test.

## Security Considerations

Không có: chỉ render dữ liệu đã có trong snapshot, không thêm input hay API mới.

## Next Steps

Phase 2 — component test mới và cập nhật 2 e2e specs chọn option theo label.
