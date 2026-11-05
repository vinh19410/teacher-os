---
title: "Phase 2: Composer Edit Mode & Save Pipeline"
description: "Cập nhật NewAssignmentRoute để hỗ trợ nạp đề theo promptId, khóa skill/part, cách ly localStorage draft, xây dựng diff payload và submit bằng update-assignment-prompt."
status: completed
---

# Phase 2: Composer Edit Mode & Save Pipeline

## Goal
Cho phép `/assignments/new` hoạt động ở cả 2 chế độ: Tạo mới đề và Chỉnh sửa đề có sẵn (`promptId`). Khi sửa đề, dữ liệu được nạp đầy đủ, skill/part được khóa, lưu thay đổi bằng action `update-assignment-prompt` qua method PATCH của server, và draft tạo mới trong máy không bị ảnh hưởng.

## Files to Create or Modify
- `apps/web/src/routes/_auth/assignments/new.tsx`
- `apps/web/src/routes/_auth/assignments/new.test.tsx`
- `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`

## Tasks & Steps

### Task 2.1 — Validate Search & Component Wrapper Remount
- **Goal:** Tiếp nhận `promptId` từ search params và remount `NewAssignmentRoute` khi `promptId` thay đổi.
- **Target files and symbols:** `apps/web/src/routes/_auth/assignments/new.tsx` (`Route`, `NewAssignmentRouteWrapper`).
- **Steps:**
  1. Cập nhật `validateSearch`:
     ```ts
     validateSearch: (search: Record<string, unknown>): { classId?: string; promptId?: string } => ({
       classId: typeof search.classId === "string" ? search.classId : undefined,
       promptId: typeof search.promptId === "string" && search.promptId.length > 0 ? search.promptId : undefined,
     })
     ```
  2. Tạo wrapper component hoặc bọc render của route với `key={promptId ?? "new"}` để bảo đảm khi chuyển giữa các đề hoặc từ tạo mới sang sửa, component remount sạch và `useState` initializers chạy lại chính xác.
- **Success criteria:** URL `/assignments/new?promptId=abc` truyền đúng `promptId` vào form và tự động remount khi param thay đổi.
- **Verify:**
  ```bash
  pnpm --filter web exec vitest run src/routes/_auth/assignments/new.test.tsx
  ```
  Pass condition: Test suite chạy qua, exit code 0.

### Task 2.2 — Khởi tạo State & Cách ly Draft Store
- **Goal:** Khi có `promptId`, form nạp dữ liệu từ `data.assignmentPrompts`. Nếu không tìm thấy, hiển thị card thông báo không tìm thấy đề. Tắt hoàn toàn việc đọc/ghi vào `assignment-draft` (localStorage).
- **Target files and symbols:** `apps/web/src/routes/_auth/assignments/new.tsx`.
- **Steps:**
  1. Lấy `existingPrompt = promptId ? data.assignmentPrompts?.find((p) => p.id === promptId) : null`.
  2. Nếu `promptId` có giá trị nhưng `!existingPrompt`: hiển thị card thông báo "Không tìm thấy đề này. Đề có thể đã bị xóa khỏi ngân hàng." kèm nút "Quay lại danh sách" (`/assignments`).
  3. Khởi tạo `value`:
     - Nếu `restored` có và khớp ngữ cảnh: dùng `restored`.
     - Nếu đang ở edit mode (`existingPrompt` tồn tại): nạp dữ liệu từ `existingPrompt` (chuẩn hóa rich text bằng `restoreRich`, câu hỏi bằng `normalizeDraftItems`).
     - Nếu không phải edit mode: nạp từ `bannerDraft` hoặc `freshComposer`.
  4. Khởi tạo `status`: lấy từ `restored?.status ?? existingPrompt?.status ?? bannerDraft?.status ?? "ready"`.
  5. Khi `isEditing` (`existingPrompt !== null`):
     - `bannerDraft` đặt thành `null`, `bannerOpen` đặt thành `false`.
     - `useEffect` autosave vào localStorage: thêm điều kiện bỏ qua `if (saved || isEditing) return;`.
     - `useEffect` set band từ `classBand`: bỏ qua khi `isEditing`.
     - Các lệnh gọi `clearAssignmentDraft()` khi submit hoặc reset: chỉ gọi khi `!isEditing`.
- **Success criteria:** Form nạp chuẩn xác nội dung đề cũ khi có `promptId`. LocalStorage `assignment-draft` không bị ghi đè hay xóa.
- **Verify:**
  ```bash
  pnpm --filter web exec vitest run src/routes/_auth/assignments/new.test.tsx
  ```
  Pass condition: Exit code 0, không có regression.

### Task 2.3 — Khóa Skill/Part & Tinh chỉnh Giao diện Edit Mode
- **Goal:** Hiển thị tiêu đề, breadcrumb và nút lưu phù hợp với ngữ cảnh chỉnh sửa; khóa cố định kỹ năng và phần thi (`lockPart={true}`).
- **Target files and symbols:** `apps/web/src/routes/_auth/assignments/new.tsx`.
- **Steps:**
  1. Truyền `lockPart={isEditing}` vào `PromptComposer`.
  2. Cập nhật breadcrumb: Nếu `isEditing` hiển thị `Bài tập › Chỉnh sửa`, ngược lại `Bài tập › Tạo mới`.
  3. Cập nhật `PageHead`:
     - Nếu `isEditing`: title "Chỉnh sửa đề bài", lead "Sửa nội dung đề Writing, Reading, Listening hoặc Speaking. Lưu thay đổi vào ngân hàng đề."
     - Nếu tạo mới: giữ nguyên tiêu đề "Thêm đề vào ngân hàng".
  4. Cập nhật nhãn nút lưu:
     - Nếu `isEditing`: `status === "draft" ? "Lưu bản nháp" : "Lưu thay đổi"`.
     - Nếu tạo mới: `status === "draft" ? "Lưu bản nháp" : "Lưu vào ngân hàng"`.
  5. Cập nhật nút Hủy: trong edit mode, bấm Hủy chuyển về `/assignments` (hoặc reset lại dữ liệu gốc của đề).
- **Success criteria:** Giao diện phản ánh đúng trạng thái Chỉnh sửa, `skill` và `part` hiển thị dạng chip tĩnh không cho đổi, dạng đề (`type`) vẫn đổi được bình thường.
- **Verify:**
  ```bash
  pnpm --filter web exec vitest run src/routes/_auth/assignments/new.test.tsx
  ```
  Pass condition: Exit code 0.

### Task 2.4 — Submit Pipeline: Diff Payload & Gọi Action `update-assignment-prompt`
- **Goal:** Xây dựng payload hợp lệ cho PATCH và gọi action `update-assignment-prompt`, chỉ đính kèm phần `writing` khi có thay đổi thực tế so với đề gốc.
- **Target files and symbols:** `apps/web/src/routes/_auth/assignments/new.tsx` (`handleSubmit`).
- **Steps:**
  1. Khi `isEditing`:
     - Kiểm tra diff giữa `value` hiện tại và `existingPrompt`:
       - Kiểm tra xem phần `writing` có thực sự thay đổi không (so sánh `part`, `type`, `prompt.trim()`). Chỉ truyền trường `writing` vào payload nếu có thay đổi (tránh lỗi 409 khi đề đã giao lớp).
     - Tạo payload theo schema `assignmentPromptUpdateSchema` (bỏ `skill`, `part`).
     - Gọi `submit.run({ type: "update-assignment-prompt", promptId: existingPrompt.id, payload: updatePayload })`.
  2. Xử lý kết quả lưu thành công (`result?.kind === "refreshed"`):
     - Hiển thị card thành công hoặc thông báo "Đã cập nhật bài tập" với nút "Xem danh sách bài tập" (`/assignments`).
  3. Cập nhật `handleReconcile`: Trong edit mode, đối chiếu snapshot theo `id === existingPrompt.id` thay vì so sánh `title + skill`.
- **Success criteria:** Bấm lưu trong edit mode gửi đúng action `update-assignment-prompt` với payload PATCH, không gửi `skill`/`part`.
- **Verify:**
  ```bash
  pnpm --filter web exec vitest run src/routes/_auth/assignments/new-submit.test.tsx
  ```
  Pass condition: Test submit cho edit mode pass, exit code 0.

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
