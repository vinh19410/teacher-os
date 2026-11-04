# Phase 2: UI Presets, Composer & Routes

## Goal

Cập nhật tầng UI và components để Writing không tự chọn sẵn dạng đề, ChipFilter không hiển thị chip nào active khi `value.type === ""`, chặn lưu trạng thái "Sẵn sàng giao" khi thiếu type (chỉ hiện thông báo lỗi khi `showErrors === true`), hiển thị nhãn "Chưa chọn dạng" ở danh sách/preview, và cập nhật các test UI hiện có.

## Target files and symbols

- `packages/ui/src/components/assignments/editor/assignment-presets.ts`: hàm `selectedTypeOf`.
- `apps/web/src/components/assignments/prompt-composer.tsx`: component `PromptComposer`.
- `apps/web/src/routes/_auth/assignments/new.tsx`: `freshComposer`, `actionCopyFor`, `canSave`, `fieldErrors`.
- `apps/web/src/routes/_auth/assignments/index.tsx`: hàm `promptMatchesQuery` (dòng 69) và render Tag (dòng 466, 501).
- `apps/web/src/components/assignments/prompt-preview-aside.tsx`: dòng 34.
- `apps/web/src/components/assignments/student-preview-paper.tsx`: dòng 47.
- `apps/web/src/routes/_auth/assignments/new.test.tsx`: cập nhật các test case phụ thuộc type mặc định.
- `apps/web/src/components/assignments/prompt-composer.test.tsx`: cập nhật các test case phụ thuộc type mặc định.

## Tasks & Steps

### Task 2.1 — Thêm helper `selectedTypeOf` trong assignment-presets
- Goal: Giữ nguyên `typeOf` hiện tại (để không phá vỡ fallback của các consumer khác) và thêm hàm `selectedTypeOf` trả về `AssignmentTypePreset | null` khi `typeId` không khớp hoặc rỗng.
- Target files: `packages/ui/src/components/assignments/editor/assignment-presets.ts`
- Steps:
  1. Thêm hàm export:
     ```ts
     export function selectedTypeOf(
       skillId: string,
       partId: string,
       typeId: string,
     ): AssignmentTypePreset | null {
       if (!typeId) return null;
       const part = partOf(skillId, partId);
       return part.types.find((type) => type.id === typeId) ?? null;
     }
     ```
  2. Giữ nguyên hàm `typeOf` hiện có (vẫn fallback về `part.types[0]`).
- Success criteria: `selectedTypeOf("writing", "task2", "")` trả về `null`; `selectedTypeOf("writing", "task2", "discuss")` trả về object preset có `id: "discuss"`, `label: "Discuss both views"`.
- Verify: `pnpm --filter @teacher-os/ui test -- packages/ui/src/components/assignments/editor/assignment-presets.test.ts` exits 0 và in `passed`.

### Task 2.2 — Cập nhật PromptComposer và NewAssignmentRoute
- Goal: `freshComposer` đặt `type: ""` cho Writing; đổi skill sang Writing hoặc đổi part của Writing đặt `type: ""`; ChipFilter không chọn chip nào khi `value.type === ""`; hiển thị lỗi khi submit ready mà thiếu type (chỉ khi `showErrors === true`).
- Target files:
  - `apps/web/src/components/assignments/prompt-composer.tsx`
  - `apps/web/src/routes/_auth/assignments/new.tsx`
- Steps:
  1. Trong `new.tsx`:
     - Sửa `freshComposer()`:
       ```ts
       function freshComposer(): ComposerValue {
         return {
           skill: "writing",
           part: "task2",
           type: "",
           band: "7.0",
           ...emptyComposer("writing", ""),
         };
       }
       ```
     - Sửa `fieldErrors`: nếu `status === "ready" && !value.type.trim()`, gán `fieldErrors.type = "Chọn dạng đề trước khi lưu sẵn sàng giao."`.
     - Sửa `canSave`: thêm điều kiện `!(status === "ready" && !value.type.trim())`.
     - Sửa `actionCopyFor`: nếu `status === "ready" && !value.type.trim()`, trả về `{ title: "Chưa chọn dạng đề", sub: "Chọn dạng đề trước khi lưu sẵn sàng giao." }`.
  2. Trong `prompt-composer.tsx`:
     - Dùng `selectedType = selectedTypeOf(value.skill, value.part, value.type)` thay vì `typeOf`.
     - ChipFilter cho type: `value={selectedType?.label ?? ""}`. Khi click chọn:
       ```ts
       onChange={(label) => {
         const next = part.types.find((entry) => entry.label === label);
         if (next) onFieldChange({ type: next.id });
       }}
       ```
     - Hiển thị thông báo lỗi `showErrors && errors.type` ngay dưới khối chọn dạng đề:
       ```tsx
       {showErrors && errors.type && (
         <p className="text-destructive text-xs">{errors.type}</p>
       )}
       ```
     - Khi đổi skill: nếu `next.id === "writing"` thì `type: ""`, ngược lại `type: next.parts[0].types[0].id`.
     - Khi đổi part: nếu `value.skill === "writing"` thì `type: ""`, ngược lại `type: next.types[0].id`.
- Success criteria: Mở form New Assignment thấy Writing Task 2 không có chip dạng đề nào active; ban đầu chưa bấm submit thì chưa hiện chữ đỏ `errors.type`; bấm submit ở chế độ ready thì `showErrors` bật lên và hiện chữ đỏ yêu cầu chọn dạng đề; bấm chọn dạng đề thì chip active và thông báo biến mất.
- Verify: `pnpm --filter web test -- prompt-composer.test.tsx` exits 0 và in `passed`.

### Task 2.3 — Cập nhật danh sách đề và preview cho prompt rỗng type
- Goal: Không hiển thị nhãn sai ("Discuss both views") cho các đề nháp có `type === ""` ở danh sách bài tập `/assignments` và các khung xem trước.
- Target files:
  - `apps/web/src/routes/_auth/assignments/index.tsx`
  - `apps/web/src/components/assignments/prompt-preview-aside.tsx`
  - `apps/web/src/components/assignments/student-preview-paper.tsx`
- Steps:
  1. Trong `apps/web/src/routes/_auth/assignments/index.tsx`:
     - Dòng 68-75 (`promptMatchesQuery`): dùng `selectedTypeOf` thay cho `typeOf`. Nếu `type` rỗng, `selectedTypeOf` trả về null và query không match nhãn ngẫu nhiên.
     - Dòng 501 (render Tag trong danh sách): `<Tag>{selectedTypeOf(pSkill, pPart, pType)?.label ?? "Chưa chọn dạng"}</Tag>`.
  2. Trong `apps/web/src/components/assignments/prompt-preview-aside.tsx`:
     - Dòng 34: `const selected = selectedTypeOf(skillId, partId, typeId);`
     - Không cố hiển thị nhãn dạng đề nếu `selected === null`.
  3. Trong `apps/web/src/components/assignments/student-preview-paper.tsx`:
     - Dòng 47: dùng `selectedTypeOf(skillId, partId, typeId)` để bảo đảm an toàn khi preview draft chưa có type.
- Success criteria: Đề nháp chưa chọn type hiển thị nhãn "Chưa chọn dạng" trên danh sách bài tập và không bị lỗi trong preview.
- Verify: `pnpm --filter web test -- index.test.tsx preview.test.tsx` exits 0 và in `passed`.

### Task 2.4 — Cập nhật các test case UI hiện có phụ thuộc type mặc định
- Goal: Cập nhật các assertion trong `new.test.tsx` và `prompt-composer.test.tsx` nơi test giả định Writing Task 2 tự chọn "Discuss both views".
- Target files:
  - `apps/web/src/routes/_auth/assignments/new.test.tsx`
  - `apps/web/src/components/assignments/prompt-composer.test.tsx`
- Steps:
  1. Trong `new.test.tsx`: nếu test submit một bài Writing mới mà chưa chọn type, cập nhật test click chọn một chip type (ví dụ "Discuss both views") trước khi submit hoặc kiểm tra riêng hành vi chặn khi chưa chọn type.
  2. Trong `prompt-composer.test.tsx`: cập nhật các fixtures nếu cần để truyền `type` rõ ràng khi test các chức năng khác.
- Success criteria: Toàn bộ suite `new.test.tsx` và `prompt-composer.test.tsx` đều pass.
- Verify: `pnpm --filter web test -- new.test.tsx prompt-composer.test.tsx` exits 0 và in `passed`.

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
