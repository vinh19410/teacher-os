---
phase: 1
title: "UI — tự động chọn kỹ năng theo syllabus"
status: completed
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: UI — tự động chọn kỹ năng theo syllabus

## Goal

Trong `AddClassModal`, khi user đổi dropdown "Template giáo trình" sang một syllabus có ≥1 kỹ năng, state `skills` của lớp được set bằng kỹ năng của syllabus đó (thứ tự canonical). "— Lớp trống —" và syllabus 0 kỹ năng giữ nguyên selection. Payload, kernel, `ClassTemplatePicker` không đổi.

## Files to Create / Modify

- Modify: `apps/web/src/components/modals/add-class-modal.tsx` — thêm pure helper + handler `changeTemplateId`, đổi 1 prop đấu dây.

## Tasks & Steps

1. **Thêm pure helper ở module scope** (ngay sau `SKILL_OPTIONS` tại `add-class-modal.tsx:29`), export để unit-test ở phase 2:

   ```tsx
   /** Kỹ năng lớp lấy từ syllabus: thứ tự canonical theo IELTS_SKILLS,
    * tự dedupe và lọc giá trị ngoài enum (phòng thủ dữ liệu cũ). */
   export function skillsFromTemplate(
   	templateSkills: readonly string[],
   ): string[] {
   	return IELTS_SKILLS.filter((skill) => templateSkills.includes(skill));
   }
   ```

2. **Thêm handler trong `AddClassModal`**, đặt cạnh `changeStart` (~`add-class-modal.tsx:132`):

   ```tsx
   function changeTemplateId(next: string) {
   	setTemplateId(next);
   	const template = templates.find((item) => item.id === next);
   	// Template rỗng hoặc syllabus chưa khai báo kỹ năng: giữ selection tay.
   	if (template && template.skills.length > 0) {
   		setSkills(skillsFromTemplate(template.skills));
   	}
   }
   ```

   Lưu ý: chọn template mới có skills → ghi đè selection tay (không merge) — đúng semantics "tự động define theo syllabus chọn".

3. **Đổi dây prop** tại `add-class-modal.tsx:262`:

   ```tsx
   <ClassTemplatePicker
   	templates={templates}
   	templateId={templateId}
   	onTemplateId={changeTemplateId}
   />
   ```

4. **Không đụng gì khác.** Cụ thể giữ nguyên (contract test + hành vi hiện có phụ thuộc):
   - Payload `templateId,` liền trước `schedule:` (`:189`) — regex `kernel-runtime.contract.test.ts:150-155`.
   - `setTemplateId("")` trong `resetForm()` (`:122`) — sau submit thành công `skills` đã được `setSkills([])` reset trước đó, không có auto-fill nào chạy lại (handler chỉ chạy khi user change).
   - `ClassTemplatePicker` nguyên vẹn (display-only, có test riêng).
   - Gate `skills: classType === "ielts" ? skills : []` (`:187`) — communication vẫn gửi `[]`.

## Verification

- `pnpm --filter web test` — toàn xanh, đặc biệt contract test regex trên source modal.
- `pnpm check` — biome pass.
- Manual (dev server): mở modal tạo lớp → bấm vài chip tay → chọn "IELTS Foundation · 2 kỹ năng" → chỉ chip của template sáng; đổi sang "— Lớp trống —" → chips giữ nguyên; submit lớp ielts không chọn chip nào nhưng có chọn template có skills → qua validation "Chọn ít nhất một kỹ năng".
