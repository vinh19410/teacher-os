---
phase: 1
title: "UI — tự điền tổng số buổi theo syllabus"
status: pending
priority: P2
effort: "45m"
dependencies: []
---

# Phase 1: UI — tự điền tổng số buổi theo syllabus

## Goal

Trong `AddClassModal`, khi user đổi dropdown "Template giáo trình" sang một syllabus có ≥1 buổi, state `total` của lớp được điền bằng tổng số lesson qua mọi `modules[]` của syllabus đó — **tính cả buổi thi (`midterm`/`final`)**. "— Lớp trống —" và syllabus 0 buổi giữ nguyên số buổi đang có. Payload, kernel, `ClassTemplatePicker` không đổi.

## Files to Create / Modify

- Modify: `apps/web/src/components/modals/add-class-modal.tsx` — thêm pure helper + mở rộng handler `changeTemplateId` sẵn có.

## Tasks & Steps

1. **Thêm `type Syllabus` vào import `mock-data` hiện có** tại `add-class-modal.tsx:19`:

   ```tsx
   import { CLASS_TYPE_LABELS, dayNames, type Syllabus } from "@/lib/mock-data";
   ```

2. **Thêm pure helper ở module scope** (ngay sau `skillsFromTemplate` tại `add-class-modal.tsx:31-37`), export để unit-test ở phase 2:

   ```tsx
   /** Tổng số buổi lấy từ syllabus: đếm mọi buổi qua mọi module,
    * gồm cả buổi thi (midterm/final). Đếm từ cây modules thay vì
    * totalLessons vì totalLessons có thể stale (chỉ sync khi replace). */
   export function sessionsFromTemplate(
   	templateModules: Syllabus["modules"] | undefined | null,
   ): number {
   	return (templateModules ?? []).reduce(
   		(sum, module) => sum + (module?.lessons?.length ?? 0),
   		0,
   	);
   }
   ```

3. **Mở rộng handler `changeTemplateId`** (`add-class-modal.tsx:145-152`) — giữ nguyên đoạn skills của PR #234, thêm đoạn số buổi:

   ```tsx
   function changeTemplateId(next: string) {
   	setTemplateId(next);
   	const template = templates.find((item) => item.id === next);
   	// Template rỗng hoặc syllabus chưa khai báo kỹ năng: giữ selection tay.
   	if (template && template.skills.length > 0) {
   		setSkills(skillsFromTemplate(template.skills));
   	}
   	// Syllabus chưa có buổi nào: giữ số buổi nhập tay.
   	const sessions = template ? sessionsFromTemplate(template.modules) : 0;
   	if (sessions > 0) {
   		setTotal(String(sessions));
   	}
   }
   ```

   Lưu ý: chọn template mới có buổi → ghi đè số buổi tay (không merge) — đúng semantics "tự động điền theo syllabus chọn", nhất quán với skills.

4. **Không đụng gì khác.** Cụ thể giữ nguyên (contract test + hành vi hiện có phụ thuộc):
   - Wiring `onTemplateId={changeTemplateId}` (`:279`) — đã đúng từ PR #234.
   - Payload `templateId,` liền trước `schedule:` và `sessionsTotal: parsedTotal` (`:206-208`) — regex `kernel-runtime.contract.test.ts:150-155`.
   - `setTotal("12")` trong `resetForm()` (`:135`) — sau submit thành công không có auto-fill nào chạy lại (handler chỉ chạy khi user change).
   - Input "Tổng số buổi" (`:304-312`) và validation 1..52 (`:184-192`) — syllabus > 52 buổi điền số thật, submit báo lỗi cap như cũ (không clamp — xem Design Decisions plan.md).
   - `ClassTemplatePicker` nguyên vẹn (display-only); modal đọc `template.modules` trực tiếp từ `templates` của `useSyllabus()` (`:99`) — object `Syllabus` đầy đủ, snapshot server gắn `modules` vào mọi syllabus row (`snapshot.ts:323`).

## Verification

- `pnpm --filter web test` — toàn xanh, đặc biệt contract test regex trên source modal.
- `pnpm check` — biome pass (import type inline đúng style sort hiện có).
- Manual (dev server): mở modal tạo lớp → chọn template syllabus 5 buổi (2 buổi thi) → ô "Tổng số buổi" thành 5; sửa tay thành 8 rồi chọn template khác → về số buổi của template mới; chọn "— Lớp trống —" → giữ nguyên; chọn syllabus rỗng (0 buổi) → giữ nguyên.
