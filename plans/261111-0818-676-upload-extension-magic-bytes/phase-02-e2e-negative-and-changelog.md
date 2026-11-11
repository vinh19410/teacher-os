---
phase: 2
title: "Phase 2: Kiểm thử E2E case âm trên stack thật, CHANGELOG & issue follow-up"
status: done
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Kiểm thử E2E case âm trên stack thật, CHANGELOG & issue follow-up

## Goal

Bổ sung kịch bản E2E âm theo yêu cầu của issue #676 vào `apps/e2e/specs/material-upload-student.spec.ts` phủ cả 2 route upload (`PUT /api/materials/files` và `PUT /api/classes/:classId/sessions/:date/materials/files`) lẫn tiền kiểm bấm submit `"Tải lên"` trên `UploadDialog`, chạy thực nghiệm spec trên stack preview cổng `8100/8101/8103/8104/8105`, cập nhật `CHANGELOG.md`, tạo issue follow-up `ai-handle` cho các route raw-PUT còn lại và chạy toàn bộ cổng chất lượng local.

## Files to Create / Modify

- Modify: `apps/e2e/specs/material-upload-student.spec.ts` — bổ sung bước kiểm tra âm E1b trên ngân hàng tài liệu + tiền kiểm bấm `"Tải lên"` trong `UploadDialog` và bước E3b trên tài liệu buổi học.
- Modify: `CHANGELOG.md` — ghi nhận thay đổi bảo mật `#676` dưới mục `## 2026-11-11` → `### Fixed`.

## Tasks & Steps

<!-- Updated: Red Team & Validation Session 1 - cover session upload negative E2E, click submit in UploadDialog negative test, and add mechanical ai-handle follow-up issue step -->

### Task 2.1 — Bổ sung kịch bản E2E âm (#676) trên cả ngân hàng, `UploadDialog` và buổi học
- **Goal:** Khẳng định trên stack E2E thật (Hono + `createFsMediaStore` + Vite preview) rằng request `PUT` giả mạo đuôi hoặc giả mạo magic-byte bị chặn `415 UNSUPPORTED_FILE_TYPE` trên cả route ngân hàng lẫn route buổi học mà không tạo bản ghi bẩn, đồng thời `UploadDialog` thực sự chặn gửi mạng khi bấm nút `"Tải lên"`.
- **Target files and symbols:**
  - `apps/e2e/specs/material-upload-student.spec.ts` (test `#647: upload thật + CORS preflight + «Phát» media + học viên đa-org qua ?org=` và chú thích đầu file).
- **Steps:**
  1. Cập nhật chú thích đầu file `apps/e2e/specs/material-upload-student.spec.ts` ghi nhận thêm các bước kiểm tra âm `#676` (E1b và E3b).
  2. **E1b — Kiểm tra âm trên route ngân hàng & `UploadDialog` (ngay trước E1):**
     - Gửi `page.request.fetch(\`${API_ORIGIN}/api/materials/files\`, { method: "PUT", headers: { Origin: WEB_ORIGIN, "Content-Type": "audio/mpeg", "X-File-Name": encodeURIComponent("payload.html") }, data: Buffer.from("<!doctype html><script>alert(1)</script>") })`; khẳng định `status() === 415` và JSON `code === "UNSUPPORTED_FILE_TYPE"`.
     - Gửi `page.request.fetch(\`${API_ORIGIN}/api/materials/files\`, { method: "PUT", headers: { Origin: WEB_ORIGIN, "Content-Type": "audio/mpeg", "X-File-Name": encodeURIComponent("spoof.mp3") }, data: Buffer.from("<!doctype html><script>alert(1)</script>") })`; khẳng định `status() === 415` và JSON `code === "UNSUPPORTED_FILE_TYPE"`.
     - Mở `/materials`, khẳng định `page.getByTestId("materials-empty")` vẫn hiển thị (chứng minh 2 request âm không lưu rác), bấm nút `"Tải file lên"` đầu tiên mở `uploadDialog`.
     - Gắn listener đếm request `PUT /api/materials/files` trong khối `try/finally` (`page.on("request", onPut)` / `page.off("request", onPut)`): gọi `await uploadDialog.getByLabel("File").setInputFiles({ name: "spoof.mp3", mimeType: "text/html", buffer: Buffer.from("<html>bad</html>") })`, khẳng định `uploadDialog.getByRole("alert")` khớp `/Định dạng chưa hỗ trợ/`, **bấm `await uploadDialog.getByRole("button", { name: "Tải lên", exact: true }).click()`**, và khẳng định bộ đếm `PUT` bằng `0` (sau đó gỡ listener trong `finally`).
     - Chọn lại file hợp lệ `MP3_NAME` (`SPEAKING_SAMPLE`) ngay trên `uploadDialog`, khẳng định `await expect(uploadDialog.getByRole("alert")).toHaveCount(0)`, rồi tiếp tục bấm `"Tải lên"` của E1 như cũ.
  3. **E3b — Kiểm tra âm trên route tài liệu buổi học (trong E3, sau khi đã mở `sessionDialog` của `classAId` và trước khi tải `PDF_NAME` thật):**
     - Gửi `page.request.fetch(\`${API_ORIGIN}/api/classes/${classAId}/sessions/${sessionDate}/materials/files\`, { method: "PUT", headers: { Origin: WEB_ORIGIN, "Content-Type": "audio/mpeg", "X-File-Name": encodeURIComponent("payload.html") }, data: Buffer.from("<!doctype html><script>alert(1)</script>") })` -> khẳng định `status() === 415` và `code === "UNSUPPORTED_FILE_TYPE"`.
     - Gửi cùng URL với `X-File-Name: encodeURIComponent("spoof.mp3")` và body HTML -> khẳng định `status() === 415` và `code === "UNSUPPORTED_FILE_TYPE"`.
     - Khẳng định `await expect(sessionDialog.getByTestId("session-materials-empty")).toBeVisible()` trước khi tiếp tục bước upload `PDF_NAME` thật của E3.
- **Success criteria:** Cả hai spec `apps/e2e/specs/material-upload-student.spec.ts` và `apps/e2e/specs/material-bank.spec.ts` chạy xanh hoàn toàn trên stack preview với port override của E2E.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/material-upload-student.spec.ts specs/material-bank.spec.ts` kết thúc với mã thoát 0 và in `2 passed`.

### Task 2.2 — Cập nhật `CHANGELOG.md`, mở issue follow-up `ai-handle` cho các route raw-PUT còn lại & chạy toàn bộ cổng chất lượng
- **Goal:** Ghi nhận thay đổi bảo mật `#676` vào `CHANGELOG.md`, đảm bảo có issue follow-up mang nhãn `ai-handle` cho Speaking/Library/Placement/Vocab/Exam-imports upload validation theo quy ước `AGENTS.md`, và xác nhận toàn bộ gate local xanh.
- **Target files and symbols:**
  - `CHANGELOG.md` (mục `## 2026-11-11` → `### Fixed`).
  - GitHub Issues của repo `vinh19410/teacher-os` (tìm kiếm chống trùng lặp trước khi tạo issue mang nhãn `ai-handle`).
- **Steps:**
  1. Trong `CHANGELOG.md`, dưới mục `## 2026-11-11` → `### Fixed`, thêm gạch đầu dòng mô tả rõ: xác thực upload tài liệu theo đuôi file (`X-File-Name` chuẩn hoá qua `sanitizeMediaFileName`, chặn dotfile và đối chiếu `MATERIAL_EXTENSION_TYPES`) cùng chữ ký magic-byte chống polyglot trên luồng đọc sớm `peekStream` (tối đa 64 byte, không đệm RAM) trước `store.put` cho cả ngân hàng tài liệu lẫn tài liệu buổi học, đồng thời đồng bộ `resolveMaterialMimeType` ở client (#676).
  2. Tìm kiếm trên GitHub (`gh issue list --state all --search "magic-byte speaking library placement" --json number,title,url`) để kiểm tra xem đã có issue follow-up cho các route raw-PUT còn lại chưa; nếu chưa có, tạo mới bằng `gh issue create --label ai-handle` nêu rõ phạm vi mở rộng từ `#676` (tái sử dụng `apps/server/src/lib/peek-stream.ts` cho `PUT /api/student/attempts/:attemptId/media` + `resolveQuizMediaType`, `PUT /api/admin/library/tests/:id/parts/:part/audio`, `PUT /api/placement-test/audio`, `PUT /api/vocab/words/:wordId/audio`, và ảnh PNG/JPEG của `POST /api/exam-imports`).
  3. Chạy `pnpm exec biome check .`, `pnpm check-types` và `pnpm test` trên toàn monorepo.
- **Success criteria:** `CHANGELOG.md` có dòng `#676`, tồn tại issue follow-up mang nhãn `ai-handle`, và toàn bộ gate local đều thoát 0.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test` kết thúc với mã thoát 0, và `gh issue list --label ai-handle --search "Speaking" --json number,title` trả về ít nhất 1 issue follow-up hợp lệ.

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

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/material-upload-student.spec.ts specs/material-bank.spec.ts`
- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm test`
