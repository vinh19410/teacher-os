---
phase: 1
title: "UI — khóa view-only 2 mục theo syllabus"
status: pending
priority: P2
effort: "45m"
dependencies: []
---

# Phase 1: UI — khóa view-only 2 mục theo syllabus

## Goal

Trong `AddClassModal`, khi một mục đang được syllabus quyết định giá trị thì mục đó render ở trạng thái view-only: chips "Kỹ năng" disabled khi template chọn có kỹ năng, ô "Tổng số buổi" disabled khi template chọn có buổi học. "— Lớp trống —" và syllabus thiếu dữ liệu tương ứng → editable như cũ. Handler, payload, validation, `ClassTemplatePicker` không đổi.

Điều kiện chạy: plan `260922-1107-class-modal-auto-sessions` (issue #235) đã merge — phase này dùng helper `sessionsFromTemplate` do #235 thêm vào `add-class-modal.tsx`.

## Files to Create / Modify

- Modify: `apps/web/src/components/ui/chip-multi.tsx` — thêm prop `disabled` optional.
- Modify: `apps/web/src/components/modals/add-class-modal.tsx` — tính 2 cờ khóa + gắn `disabled` vào chips kỹ năng và input số buổi.

## Tasks & Steps

1. **Thêm prop `disabled` vào `ChipMulti`** (`chip-multi.tsx`):

   ```tsx
   export interface ChipMultiProps<T extends string | number> {
   	options: ChipMultiOption<T>[];
   	value: T[];
   	onChange: (next: T[]) => void;
   	className?: string;
   	/** View-only: khóa toàn bộ chip, giữ giá trị hiển thị (aria-pressed nguyên vẹn). */
   	disabled?: boolean;
   }
   ```

   Ở signature và từng button:

   ```tsx
   export function ChipMulti<T extends string | number>({
   	options,
   	value,
   	onChange,
   	className,
   	disabled,
   }: ChipMultiProps<T>) {
   ```

   ```tsx
   <button
   	type="button"
   	key={String(option.value)}
   	aria-pressed={value.includes(option.value)}
   	disabled={disabled}
   	onClick={() => toggle(option)}
   	className={cn(
   		"rounded-full border px-[14px] py-[6px] font-medium text-xs transition-all duration-[150ms] ease-[cubic-bezier(0.28,0,0.22,1)]",
   		"focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
   		"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
   		value.includes(option.value)
   			? "border-fg bg-fg text-bg"
   			: "border-line bg-bg text-fg-2 hover:border-fg",
   	)}
   >
   ```

   Prop optional nên các chỗ dùng khác (Loại lớp, Ngày học, các modal khác) không đổi behavior. `disabled:pointer-events-none` chặn cả hover feedback; `aria-pressed` giữ nguyên để giá trị vẫn đọc được.

2. **Tính 2 cờ khóa trong `AddClassModal`** — chèn sau khối `useEffect` (`add-class-modal.tsx:117-122`), trước `resetForm`:

   ```tsx
   // Mục đã base theo syllabus thì view-only: điều kiện khóa trùng
   // điều kiện auto-fill trong changeTemplateId — khóa đúng khi giá trị
   // đang do syllabus quyết định.
   const selectedTemplate = templates.find((item) => item.id === templateId);
   const skillsLocked = Boolean(
   	selectedTemplate && selectedTemplate.skills.length > 0,
   );
   const sessionsLocked = Boolean(
   	selectedTemplate && sessionsFromTemplate(selectedTemplate.modules) > 0,
   );
   ```

   `templates` từ `useSyllabus()` là `Syllabus[]` đầy đủ (có `skills` lẫn `modules`) — modal đọc trực tiếp, không mở rộng props của `ClassTemplatePicker` (pattern #235 đã chốt).

3. **Gắn `disabled` vào 2 control**:
   - Chips kỹ năng (`:267-275`, chỉ render khi `classType === "ielts"`):

     ```tsx
     <ChipMulti
     	options={SKILL_OPTIONS}
     	value={skills}
     	onChange={setSkills}
     	disabled={skillsLocked}
     />
     ```

   - Ô "Tổng số buổi" (`:304-312`):

     ```tsx
     <Input
     	type="number"
     	min={1}
     	max={52}
     	value={total}
     	onChange={(e) => setTotal(e.target.value)}
     	disabled={sessionsLocked}
     />
     ```

4. **Không đụng gì khác.** Cụ thể giữ nguyên:
   - Handler `changeTemplateId` (`:145-152`), payload `templateId,` liền trước `schedule:` + `sessionsTotal: parsedTotal` (`:206-208`) — regex contract `kernel-runtime.contract.test.ts:150-155`.
   - Validation 1..52 (`:184-192`) — syllabus > 52 buổi: input khóa, submit vẫn báo "Tổng số buổi tối đa là 52." như cơ chế hiện có (không clamp, không message riêng — người dùng đổi template hoặc về lớp trống để thoát).
   - `resetForm()` (`:124-138`) — `templateId: ""` nên sau submit/xác nhận reconcile, mọi thứ tự về editable.
   - Disabled input không tham gia native form submit, nhưng payload tự build từ state `total`/`skills` → `sessionsTotal` và `skills` vẫn gửi đúng.
   - `ClassTemplatePicker` nguyên vẹn.

## Verification

- `pnpm --filter web test` — toàn xanh, kể cả contract test regex trên source modal.
- `pnpm check` — biome pass.
- Manual (dev server): mở modal tạo lớp → chọn syllabus có kỹ năng + 5 buổi → chips và ô số buổi mờ, không bấm/gõ được, giá trị đúng theo syllabus; chọn "— Lớp trống —" → editable lại; chọn syllabus 0 buổi → ô số buổi editable, chips vẫn khóa (nếu syllabus có kỹ năng).
