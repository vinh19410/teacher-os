---
title: "Phase 6: Web UI TemplatePicker và tách editor"
status: completed
---

# Phase 6: Web UI TemplatePicker và tách editor

## Goal

Một `TemplatePicker` có preview dùng chung cho tạo lớp và gán sau; trang `/syllabus/$syllabusId` chỉ là template editor; không còn nhánh "con trỏ lệch" và không còn `classId === null` ngoài `repos/syllabus.ts`.

## Context

- Design: D8 trong [design-decisions.md](./reports/design-decisions.md). Đọc `DESIGN.md` và `REVIEW.md` trước khi sửa UI: token màu, type và motion lấy từ `packages/ui/src/styles/globals.css`, không hard-code giá trị lệch scale; component shadcn nằm ở `apps/web/src/components/ui/*`.
- `ClassTemplatePicker` (trong `add-class-modal.tsx`, ~dòng 58-107) hiện là select kèm dòng "— Lớp trống —" và danh sách kỹ năng; `ImportSyllabusModal` có select riêng. Logic tự điền kỹ năng và số buổi khi chọn template (hàm `skillsFromTemplate`, `sessionsFromTemplate`, handler ~dòng 205-215) và việc khoá ô theo template (`selectedTemplate`) **phải giữ nguyên**.
- Dùng `<select>` native (qua `Field` và `Select` có sẵn) cho phần chọn để giữ nguyên hành vi bàn phím và các selector e2e hiện tại; phần mới là vùng preview.
- Không thêm endpoint: preview dùng dữ liệu `SyllabusTemplate` đã có trong snapshot (`modules[].lessons[]`).
- Snapshot được tải xong trước khi app render (lỗi tải ban đầu có màn hình riêng), nên picker không cần trạng thái "đang tải"; các trạng thái cần có: danh sách rỗng, chưa chọn (khi `allowEmpty`), đã chọn, và giá trị đã chọn không còn trong danh sách (rơi về mục đầu hoặc rỗng như `ImportSyllabusModal` đang làm).

## Files

- Create: `apps/web/src/components/syllabus/template-picker.tsx`, `apps/web/src/components/syllabus/template-picker.test.tsx`
- Modify: `apps/web/src/components/modals/add-class-modal.tsx` (+ `add-class-modal.test.tsx`)
- Modify: `apps/web/src/components/modals/import-syllabus-modal.tsx` (+ `import-syllabus-modal.test.tsx`)
- Modify: `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx` (+ `$syllabusId.test.tsx`), `apps/web/src/routes/_auth/syllabus/index.tsx` (+ `index.test.tsx`)
- Modify: `apps/web/src/components/class-detail/curriculum-management-section.tsx`, `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`
- Modify: `apps/web/src/lib/repos/use-syllabus.ts` (xoá `templates` khỏi `useSyllabus` khi hết người dùng)

## Tasks

### Task 6.1: Component `TemplatePicker`

- **Goal:** chọn template có preview chỉ đọc.
- **Target files:** `apps/web/src/components/syllabus/template-picker.tsx`, `template-picker.test.tsx`.
- **Steps:**
  1. Props: `templates: readonly SyllabusTemplate[]`, `value: string`, `onChange(id: string): void`, `allowEmpty?: boolean`, `emptyLabel?: string` (mặc định "— Lớp trống —"), `label?: string` (mặc định "Template giáo trình"), `disabled?: boolean`.
  2. Render: `Field` + `Select` (option rỗng chỉ khi `allowEmpty`); mỗi option là `${name} · ${totalLessons} buổi`. Khi `templates.length === 0` hiện đoạn chữ "Chưa có template nào — tạo syllabus ở trang Syllabus trước." (giữ câu hiện có của `ImportSyllabusModal`) và không render select.
  3. Preview (khi có template được chọn): dòng tóm tắt (kỹ năng bằng `Tag` như `ClassTemplatePicker` hiện làm, hoặc "Syllabus chưa khai báo kỹ năng"; số buổi), rồi một `<details>` "Xem nội dung" liệt kê module và tiêu đề lesson (chỉ đọc), dùng `LessonKindBadge` hoặc helper trong `components/syllabus/lesson-kind.tsx` cho buổi thi giữa kỳ và cuối kỳ. Vùng preview có `aria-live="polite"` để người dùng đọc màn hình biết nội dung đổi khi chọn template khác.
  4. Chỉ dùng class token trong `globals.css` (ví dụ `text-muted-foreground`, `border-border`); không hex, không giá trị px tuỳ ý ngoài scale.
  5. Test (RTL, theo mẫu `add-class-modal.test.tsx`): (a) danh sách rỗng hiện thông báo và không có select; (b) `allowEmpty` có option rỗng, chọn rỗng thì không có preview; (c) chọn một template hiện số buổi và đúng danh sách kỹ năng; (d) mở `<details>` thấy tiêu đề module và lesson; (e) `value` không có trong `templates` thì không crash và không có preview.
- **Success criteria:** 5 test xanh.
- **Verify:** `pnpm --filter web exec vitest run src/components/syllabus/template-picker.test.tsx` exits 0 and prints `5 passed`.

### Task 6.2: Dùng `TemplatePicker` ở tạo lớp và gán sau

- **Goal:** hai nơi chọn template cùng một component.
- **Target files:** `add-class-modal.tsx`, `import-syllabus-modal.tsx` và test của chúng.
- **Steps:**
  1. `add-class-modal.tsx`: thay `<ClassTemplatePicker .../>` bằng `<TemplatePicker allowEmpty templates={templates} value={templateId} onChange={onTemplateId} />`; `templates` lấy từ `useTemplates()`. Xoá hàm `ClassTemplatePicker` khi không còn người dùng (cập nhật `add-class-modal.test.tsx` đang import nó sang test qua `TemplatePicker` hoặc qua modal).
  2. `import-syllabus-modal.tsx`: thay `Field`/`Select` thủ công bằng `TemplatePicker`; giữ logic "effective selection" (`templates.some(...)`) và nút "Nhập giáo trình" bị vô hiệu khi không có template.
  3. Không đổi payload `create-class` hay `import-curriculum`.
- **Success criteria:** các test cũ của hai modal vẫn xanh sau khi cập nhật import; hành vi tự điền kỹ năng và số buổi không đổi.
- **Verify:** `pnpm --filter web exec vitest run src/components/modals/add-class-modal src/components/modals/import-syllabus-modal` exits 0 with `0 failed`; `rg -n "ClassTemplatePicker" apps/web/src` prints nothing (exit code 1).

### Task 6.3: Trang `/syllabus/$syllabusId` chỉ là template editor

- **Goal:** bỏ vai trò kép.
- **Target files:** `routes/_auth/syllabus/$syllabusId.tsx`, `$syllabusId.test.tsx`, `routes/_auth/syllabus/index.tsx`.
- **Steps:**
  1. Tìm syllabus bằng `useTemplates().find((t) => t.id === syllabusId)`. Nếu không thấy (id không tồn tại hoặc là bản copy của lớp), hiện đúng trạng thái "không tìm thấy" mà trang đang dùng cho id không tồn tại (không thêm màn hình mới).
  2. Xoá nhánh `sy.classId === null ? "Template dùng chung" : "Bản sao của một lớp"` ở `lead`; chỉ còn chuỗi cho template. Xoá điều kiện bọc nút import ghi đè `sy.classId === null &&` vì trang này luôn là template.
  3. "Đang dùng N lớp": dùng `useTemplateUsage().get(sy.id)?.length ?? 0` và danh sách lớp lấy từ đó.
  4. `routes/_auth/syllabus/index.tsx`: lấy danh sách từ `useTemplates()`; đếm "đang dùng" từ `useTemplateUsage()`.
  5. Cập nhật test: thêm một test cho id của bản copy → trạng thái không tìm thấy.
- **Success criteria:** trang không còn nhắc `classId`.
- **Verify:** `rg -n "classId" apps/web/src/routes/_auth/syllabus/index.tsx 'apps/web/src/routes/_auth/syllabus/$syllabusId.tsx'` prints nothing (exit code 1); `pnpm --filter web exec vitest run src/routes/_auth/syllabus` exits 0 with `0 failed`.

### Task 6.4: Tab Giáo trình của lớp

- **Goal:** bỏ nhánh con trỏ lệch; component nhận dữ liệu từ hook.
- **Target files:** `curriculum-management-section.tsx`, `class-sessions-manage-modal.tsx`, `routes/_auth/classes/$classId.tsx`.
- **Steps:**
  1. `curriculum-management-section.tsx`: dùng `useClassCurriculum(cls.id)`; nếu có thì hiện thẻ giáo trình + nút "Gỡ giáo trình"; nếu không thì hiện thẻ trống + nút "Nhập từ template". Xoá hẳn nhánh thứ ba (con trỏ lệch) và điều kiện `cls.syllabusId === ""`. Xoá prop `syllabus` nếu nó trở thành thừa (cập nhật nơi gọi ở `$classId.tsx:~327` và bỏ biểu thức `sy && sy.classId === classId ? sy : null`).
  2. Đổi nội dung modal xác nhận gỡ thành: "Toàn bộ cây giáo trình của lớp (kèm tiến độ buổi học) sẽ bị xoá. Template gốc và các lớp khác không bị ảnh hưởng. Hành động này không thể hoàn tác." (bỏ câu về "con trỏ lệch").
  3. `class-sessions-manage-modal.tsx`: bỏ đối tượng placeholder `{ id: "", name: "", ... classId: null ... }` và biến `validCopy`; dùng `useClassCurriculum(cls.id)`; `useSyllabusMutations` đã nhận `syllabus` có thể null (phase 5).
  4. Cập nhật các test của ba file này (`$classId.test.tsx`, test của modal nếu có).
- **Success criteria:** không còn chuỗi "con trỏ lệch" và không còn `classId` trong ba file.
- **Verify:** `rg -n "con trỏ lệch|validCopy" apps/web/src` prints nothing (exit code 1); `pnpm --filter web test` exits 0 with `0 failed`.

### Task 6.5: Cổng grep, dọn hook cũ, kiểm tra tổng

- **Steps:**
  1. Chạy cổng grep của plan (`Success Criteria`) và xử lý mọi dòng còn lại.
  2. Xoá `templates` khỏi `useSyllabus()` nếu `rg -n "useSyllabus\(\)" apps/web/src --glob '!*.test.*'` không còn ai đọc `templates` từ nó.
  3. `pnpm exec biome check apps packages`, `pnpm check-types`, `pnpm --filter web test`.
- **Success criteria:** cổng grep sạch; ba lệnh xanh.
- **Verify:** `rg -n "classId\s*(===|!==)\s*null" apps/web/src --glob '!**/*.test.*' --glob '!**/repos/syllabus.ts' --glob '!**/vocab/**'` prints nothing (exit code 1); `pnpm check-types` exits 0; `pnpm --filter web test` exits 0 with `0 failed`.

### Task 6.6: Kiểm tra thị giác và bàn phím

- **Goal:** UI đúng design v2 ở 3 viewport.
- **Steps:**
  1. Theo `docs`/process: kiểm tra cổng 8000, 8001, 8003 trước (`lsof -i :8000`) rồi dùng override e2e `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103` khi cần chạy stack; ghi lại PID các tiến trình bạn khởi chạy và dừng chúng khi xong (`pkill -f` theo mẫu cụ thể của chính tiến trình đó).
  2. Chụp ảnh: modal tạo lớp (chọn template, mở "Xem nội dung"), modal "Nhập giáo trình từ template", tab Giáo trình của lớp (có và không có giáo trình), trang `/syllabus/$syllabusId`; mỗi màn ở 1440×900, 768×1024 và 375×812.
  3. Đi bằng bàn phím: Tab tới select, mũi tên đổi template, Tab tới "Xem nội dung", Enter/Space mở; focus ring hiện rõ và không bị kẹt trong modal.
  4. Chạy `pnpm design:compare`.
- **Success criteria:** không tràn ngang, không chữ bị cắt, không phần tử chồng nhau ở 375px; `pnpm design:compare` exit 0.
- **Verify:** `pnpm design:compare` exits 0. Phần ảnh và bàn phím là đánh giá thị giác của người: đính ảnh vào mô tả PR và nêu rõ đã kiểm gì.

## Success Criteria

- [ ] Một component chọn template dùng ở tạo lớp và gán sau; `ClassTemplatePicker` đã xoá.
- [ ] Trang `/syllabus/$syllabusId` chỉ nhận template; id bản copy hiện "không tìm thấy".
- [ ] Không còn nhánh con trỏ lệch ở web.
- [ ] Cổng grep `classId === null` sạch; web test, check-types, design:compare xanh.
- [ ] Ảnh 3 viewport đính vào PR.

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
