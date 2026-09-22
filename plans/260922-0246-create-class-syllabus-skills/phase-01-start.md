---
title: "Phase 1: UI — hiển thị kỹ năng của syllabus trong modal tạo lớp"
status: done
---

# Phase 1: UI — hiển thị kỹ năng của syllabus trong modal tạo lớp

## Context Links

- Scout report: đoạn dropdown được verify trực tiếp tại `apps/web/src/components/modals/add-class-modal.tsx:212-224`
- Pattern Tag skills: `apps/web/src/routes/_auth/syllabus/index.tsx:100-106`
- Contract test ràng buộc: `apps/web/src/lib/kernel-runtime.contract.test.ts:150-155`
- Native Select base: `apps/web/src/components/ui/field.tsx:101-112`

## Overview

- **Priority**: P1
- **Status**: done
- Sửa rendering của dropdown "Template giáo trình" trong `AddClassModal`: option label thêm count kỹ năng, thêm hàng Tag kỹ năng dưới dropdown cho template đang chọn. Không đổi data flow, không đổi backend.

## Key Insights

- `useSyllabus().templates` (dòng 42 của modal) đã trả về `Syllabus` với `skills: string[]`, `totalLessons` — dữ liệu đủ, không cần fetch thêm.
- Native `<option>` không style được; text option quá dài sẽ truncate tùy OS. Do đó count vào option, tên skills vào hàng Tag bên dưới (thấy ngay khi duyệt selection, không cần submit).
- Modal đang giữ `templateId` state; derived value `selectedTemplate = templates.find((s) => s.id === templateId)` là đủ, không thêm state mới.

## Requirements

- [x] Option label dạng `${s.name} · ${s.skills.length} kỹ năng` cho mọi template. Count đọc `s.skills` của syllabus, không đọc state `skills` của chip "Kỹ năng *" trên lớp.
- [x] `<Select>` vẫn là child duy nhất của `<Field label="Template giáo trình">`. `Field` chỉ gắn `id`/`htmlFor` khi có đúng một child (`field.tsx`). Hàng hint là sibling ngay sau `</Field>`, không phải child thứ hai, không bọc fragment, không thêm prop lên opening tag (regex contract đòi `>` ngay sau label).
- [x] Khi syllabus đang chọn có `selectedTemplate.skills.length > 0`: sibling gồm nhãn "Kỹ năng giáo trình" và một `<Tag>` mỗi skill. Nhãn này không ghi vào payload `skills`.
- [x] Khi syllabus đang chọn có `selectedTemplate.skills.length === 0` (kể cả template Giao tiếp, vốn hợp lệ khi không có kỹ năng): render `<p className="text-muted-fg text-sm">` "Syllabus chưa khai báo kỹ năng".
- [x] Khi `templateId === ""` ("— Lớp trống —"): không render hàng thông tin nào.
- [x] Giữ nguyên chuỗi `<Field label="Template giáo trình">`, payload `templateId,` và `setTemplateId("")` để không vỡ contract test.

## Architecture

Một chiều đơn giản trong component: `templates` (đã có) → `selectedTemplate` (derived) → (a) option labels trong `<Select>`, (b) hàng hint dưới `<Select>`. Không thêm state, không thêm API call, không đụng store/kernel.

## Related Code Files

- Modify: `apps/web/src/components/modals/add-class-modal.tsx` (thêm import `Tag`, derived `selectedTemplate`, option label, hint block)

## Implementation Steps

1. Thêm `import { Tag } from "@/components/ui/tag";` vào đầu file.
2. Trong component, sau các state declarations, thêm `const selectedTemplate = templates.find((s) => s.id === templateId);`.
3. Sửa option trong `templates.map` (dòng ~218-222): `<option key={s.id} value={s.id}>{s.name} · {s.skills.length} kỹ năng</option>`.
4. Ngay sau `</Field>` của "Template giáo trình" (không thêm child bên trong Field), render hint theo `selectedTemplate.skills`: Tag + nhãn "Kỹ năng giáo trình", câu rỗng, hoặc không render.
5. Chạy `pnpm --filter web test` và `pnpm check`; sửa vi phạm nếu có.

## Todo

- [x] Import Tag + picker: Select là child duy nhất, hint là sibling
- [x] Option label `Tên · N kỹ năng` từ `s.skills`
- [x] Hint: nhãn "Kỹ năng giáo trình" + Tag / câu rỗng / ẩn khi lớp trống
- [x] `pnpm --filter web test` pass (contract test giữ nguyên không cần sửa)
- [x] `pnpm check` (Biome) pass

## Success Criteria

Modal render đúng 3 trạng thái hint (có skills / rỗng / lớp trống), option label có count, toàn bộ test web pass mà không cần sửa contract test.

## Risk Assessment

- **Option text dài gây wrap/truncate ở một số OS**: đã giảm bằng cách chỉ đưa count vào option (tên skills nằm ở hàng Tag).
- **Quên trường hợp `skills: []`:** `mapSyllabi` chỉ ra `[]` khi không có `skills` lẫn `skill` số ít; `skill` legacy thành mảng một phần tử và hiện Tag. Template Giao tiếp hợp lệ với `skills: []` và hiện câu "chưa khai báo", đúng yêu cầu issue.
- **Vỡ contract test regex**: mitigation là giữ nguyên 3 chuỗi đã liệt kê; verification bằng chính contract test.

## Security Considerations

Không có: chỉ render dữ liệu đã có trong snapshot, không thêm input hay API mới.

## Next Steps

Phase 2 — component test mới và cập nhật 2 e2e specs chọn option theo label.
