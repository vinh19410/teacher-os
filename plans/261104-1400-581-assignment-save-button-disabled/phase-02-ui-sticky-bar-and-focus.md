# Phase 2: Giao diện thanh sticky, danh sách lỗi cạnh nút và focus trường

## Goal
Loại bỏ trạng thái `disabled={!canSave}` trên nút Lưu; thêm cơ chế cuộn mượt và focus an toàn (`preventScroll: true`) vào trường lỗi đầu tiên; bổ sung hộp cảnh báo danh sách trường thiếu cạnh nút Lưu trên thanh sticky và củng cố styling thanh sticky cho responsive/safe-area.

## Target files and symbols
- `apps/web/src/routes/_auth/assignments/new.tsx`:
  - Hàm `focusFirstMissingField(missing: MissingRequirement[])`
  - Re-entrancy guard trong `handleSubmit`: `if (submit.saving) return;`
  - Đổi nút submit: `disabled={submit.saving}` (luôn bấm được khi không saving).
  - Thanh sticky: thêm `z-20`, `pb-[max(0.75rem,env(safe-area-inset-bottom))]`, hộp alert hiển thị danh sách lỗi với giới hạn `max-h-36 overflow-y-auto`.
- `apps/web/src/components/assignments/prompt-composer.tsx`:
  - Gắn ID `assignment-field-*` và class `scroll-mt-24 scroll-mb-28` cho các trường nhập liệu.
- `packages/ui/src/components/assignments/editor/question-key-editor.tsx`:
  - Đảm bảo ô input ảnh có id `assignment-field-image`.

## Tasks & Steps

### Task 2.1 — Gắn ID và scroll margins cho các trường trong PromptComposer
- **Goal:** Đảm bảo mọi trường nhập liệu có ID tường minh và scroll margins phù hợp (không bị che bởi cả topbar lẫn sticky footer).
- **Target files:** `apps/web/src/components/assignments/prompt-composer.tsx`
- **Steps:**
  1. Gắn id `assignment-field-title` cho ô nhập tiêu đề và `htmlFor="assignment-field-title"` trên `Field`.
  2. Gắn id `assignment-field-type` cho container dạng đề, thêm `tabIndex={-1}` để có thể focus.
  3. Gắn id `assignment-field-prompt` cho wrapper RichTextEditor đề bài.
  4. Gắn id `assignment-field-passage` cho wrapper RichTextEditor bài đọc.
  5. Gắn id `assignment-field-audio` cho thẻ input file nghe.
  6. Gắn id `assignment-field-cueTopic` cho ô nhập chủ đề Speaking Part 2.
  7. Gắn id `assignment-field-questions` cho khối QuestionKeyEditor, thêm `tabIndex={-1}`.
  8. Thêm class `scroll-mt-24 scroll-mb-28` cho các container/field trên để khi cuộn không bị che bởi topbar hoặc bottom sticky bar.
- **Success criteria:** Các input/container trên có id tương ứng và scroll margins.
- **Verify:** `pnpm --filter web test src/routes/_auth/assignments/new.test.tsx` exits 0.

### Task 2.2 — Mở khóa nút Lưu, cài đặt focus an toàn và hiển thị danh sách lỗi
- **Goal:** Nút Lưu luôn bấm được; bấm Lưu khi form chưa đủ điều kiện sẽ bật lỗi, hiện alert danh sách lỗi cạnh nút và focus vào trường đầu tiên.
- **Target files:** `apps/web/src/routes/_auth/assignments/new.tsx`
- **Steps:**
  1. Thêm re-entrancy guard ở đầu `handleSubmit`: `if (submit.saving) return;`.
  2. Cài đặt hàm helper `focusField(fieldId: string)`:
     - Tìm element theo ID: `const target = document.getElementById(fieldId);`
     - Nếu không tìm thấy, return.
     - Tìm input/editable có thể focus:
       - Nếu target có `[contenteditable]` hoặc `.ProseMirror`, chọn nó.
       - Hoặc nếu target là input/select/button/textarea, chọn nó.
       - Hoặc nếu target có `tabIndex`, chọn chính target.
     - Cuộn: `target.scrollIntoView?.({ behavior: "smooth", block: "center" });`
     - Focus: `focusable.focus({ preventScroll: true });`
  3. Trong `handleSubmit`, khi `!canSave`:
     - Bật `setShowErrors(true);`
     - Tìm requirement đầu tiên có `fieldId`: `const first = missingRequirements.find(m => m.fieldId);`
     - Gọi `focusField(first.fieldId);`
     - Return (chặn gọi `submit.run`).
  4. Trong sticky footer:
     - Cập nhật wrapper: `className="sticky bottom-0 z-20 mt-5 border-border border-t bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur shadow-sm"`
     - Nút submit: `<Button type="submit" disabled={submit.saving}>` (bỏ `!canSave`).
     - Khi `showErrors && !canSave && missingRequirements.length > 0`:
       Hiển thị hộp alert phía trên hoặc bên cạnh nút:
       ```tsx
       <div role="alert" className="mb-2 max-h-36 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-xs">
         <div className="font-semibold mb-1">Cần hoàn thiện trước khi lưu:</div>
         <ul className="list-disc list-inside space-y-0.5">
           {missingRequirements.map((req) => (
             <li key={req.id}>
               {req.fieldId ? (
                 <button
                   type="button"
                   className="text-left underline hover:opacity-80"
                   onClick={() => focusField(req.fieldId!)}
                 >
                   {req.label}
                 </button>
               ) : (
                 req.label
               )}
             </li>
           ))}
         </ul>
       </div>
       ```
- **Success criteria:** Nút submit không có `disabled` khi form rỗng; bấm submit thì `showErrors` bật lên, danh sách lỗi xuất hiện và focus trường đầu tiên.
- **Verify:** `pnpm --filter web test src/routes/_auth/assignments/new.test.tsx` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
