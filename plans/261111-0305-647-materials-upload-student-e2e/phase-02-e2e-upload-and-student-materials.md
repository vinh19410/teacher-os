---
phase: 2
title: "Phase 2: Bổ sung spec E2E upload file thật, nút Phát media, học viên qua ?org= & CHANGELOG"
status: todo
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Bổ sung spec E2E upload file thật, nút Phát media, học viên qua ?org= & CHANGELOG

<!-- Updated: Red-Team & Validation Session 1 - exact 4-step student/class seed, exact strict-mode Playwright locators, pre-click popup/response listeners, negative CORS origin check, accurate E6 fallback description, CHANGELOG.md update -->

## Goal
Xác minh tự động end-to-end trên trình duyệt thật (cross-origin web `:8101` / student `:8103` → API `:8100`) các luồng upload file `PUT` raw body, preflight CORS `OPTIONS` + `X-File-Name` tiếng Việt, nút «Phát» mở tab media không vướng CSP, học viên đa-org xem/phát/tải tài liệu buổi học qua `?org=`, và cập nhật `CHANGELOG.md`.

## Files to Create / Modify
- Create: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/e2e/specs/material-upload-student.spec.ts`
- Modify: `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/CHANGELOG.md`

## Tasks & Steps

### Task 2.1 — Tạo spec E2E `material-upload-student.spec.ts` phủ trọn 6 kịch bản (E1–E6)
- **Goal:** Viết spec Playwright tự chứa, không commit thêm file nhị phân mới (tái sử dụng `apps/e2e/fixtures/speaking-sample.mp3` cho MP3 thật và sinh buffer PDF tối thiểu hợp lệ ngay trong test), phủ đủ 6 kịch bản với bộ chọn strict-mode chính xác 100%.
- **Target files and symbols:**
  - Create `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/apps/e2e/specs/material-upload-student.spec.ts`.
  - Reuse helpers từ `apps/e2e/specs/helpers.ts` (`acceptEnrollment`, `orgIdForTeacherEmail`, `seedStudent`, `signUpViaApi`, `verifyStudentEmailFromMailLog`, `vietnamTodayISO`), `apps/e2e/specs/helpers-dated-class.ts` (`seedDatedClass`), và `apps/e2e/specs/origins.ts` (`API_ORIGIN`, `WEB_ORIGIN`, `STUDENT_ORIGIN`).
- **Steps:**
  1. Đọc `apps/e2e/fixtures/speaking-sample.mp3` bằng `readFileSync(new URL("../fixtures/speaking-sample.mp3", import.meta.url))` và tạo helper `minimalPdfBytes(marker: string): Buffer` trả về nội dung `%PDF-1.4\n...%%EOF` hợp lệ chứa `marker` duy nhất theo lần chạy. Đặt hằng tên file Unicode: `MP3_NAME = \`Bài nghe – Unit 1 (\${stamp}).mp3\`` và `PDF_NAME = \`Phiếu bài tập – Buổi 1 (\${stamp}).pdf\``.
  2. Cài đặt kiểm thử cho phía giáo viên & preflight (E1–E4):
     - **E2 (CORS Preflight contract — cả dương và âm):**
       - Dương (`Origin: WEB_ORIGIN`): gửi `page.request.fetch(\`${API_ORIGIN}/api/materials/files\`, { method: "OPTIONS", headers: { Origin: WEB_ORIGIN, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,x-file-name" } })`; khẳng định status `204`, `access-control-allow-origin === WEB_ORIGIN`, `access-control-allow-credentials === "true"`, `access-control-allow-methods` chứa `PUT`, `access-control-allow-headers` (lowercase) chứa `content-type` và `x-file-name`.
       - Âm (`Origin: "https://evil.example"`): cùng request `OPTIONS` với `Origin: "https://evil.example"` không được trả `access-control-allow-origin: https://evil.example`.
     - **E1 (Upload ngân hàng `PUT` raw body + Unicode `X-File-Name`):**
       - Đăng ký giáo viên Org A (`signUpViaApi(page, { name: \`Trung tâm Alpha \${stamp}\` })`), lấy `orgAId = await orgIdForTeacherEmail(teacherAEmail)`.
       - Mở `/materials`; vì ngân hàng rỗng có 2 nút «Tải file lên» hiển thị đồng thời (`PageHead` và `materials-empty`), bắt buộc gọi `await page.getByRole("button", { name: "Tải file lên" }).first().click()`.
       - Trên `uploadDialog = page.getByRole("dialog", { name: "Tải file lên" })`, gọi `await uploadDialog.getByLabel("File").setInputFiles({ name: MP3_NAME, mimeType: "audio/mpeg", buffer: SPEAKING_SAMPLE })`, sau đó dùng `Promise.all` vừa đợi `page.waitForResponse((r) => r.url().includes("/api/materials/files") && r.request().method() === "PUT")` vừa bấm `uploadDialog.getByRole("button", { name: "Tải lên", exact: true }).click()`.
       - Khẳng định response `201`, request header `x-file-name === encodeURIComponent(MP3_NAME)`, lưu `mp3MaterialId` từ JSON trả về. Kiểm dòng `material-item` chứa `MP3_NAME` hiển thị.
       - Bấm `getByRole("link", { name: \`Tải xuống \${MP3_NAME}\` })` cùng `page.waitForEvent("download")`; khẳng định `download.suggestedFilename() === MP3_NAME` và byte đọc từ `await download.path()` khớp hệt `SPEAKING_SAMPLE`.
     - **E4 (Nút «Phát» của giáo viên mở tab `inline` media):**
       - **Trước khi click**, gắn listener trên `page.context().on("page", ...)` để thu toàn bộ `console` message kiểu `"error"` và `"pageerror"` ngay từ thời điểm trang mới khởi tạo (tránh hụt lỗi trên loopback nhanh).
       - Chạy đồng thời trong `Promise.all`: (a) `page.context().waitForEvent("response", (r) => r.url().includes(\`/api/materials/\${mp3MaterialId}/file\`) && r.request().resourceType() === "document")`, (b) `page.waitForEvent("popup")`, và (c) `page.getByRole("link", { name: \`Phát \${MP3_NAME}\` }).click()`.
       - Khẳng định document response có status `200`, `Content-Disposition` bắt đầu bằng `inline;`, `Content-Security-Policy` chứa `media-src 'self'` và `sandbox allow-same-origin`, **không** chứa `allow-scripts`, kèm `Cross-Origin-Opener-Policy === "same-origin"` và `Referrer-Policy === "no-referrer"`.
       - Dùng `expect.poll` trên phần tử `video, audio` bên trong `popup` xác nhận `readyState >= 1`, `error === null`, `duration > 0`; xác nhận mảng lỗi console không có thông điệp CSP hay CORS. Đóng `popup`.
     - **E3 (Seed học viên Org A + lớp 1 buổi + upload trực tiếp vào buổi học từ modal + gắn MP3):**
       - Thực hiện đúng 4 bước tường minh (không truyền `students` vào `seedDatedClass`):
         1. `const stuA = await seedStudent({ teacherEmail: teacherAEmail, name: "Học viên Đa Org", email: studentEmail, onboarded: true });`
         2. `const classAId = await seedDatedClass(page, { name: \`Lớp Tài liệu \${stamp}\`, startDate: today, sessionsTotal: 1 });`
         3. `const enrollRes = await page.request.post(\`${API_ORIGIN}/api/classes/\${classAId}/enroll\`, { data: { studentId: stuA.id }, headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" } });` (khẳng định `201`, lấy `enrollmentId`).
         4. `await acceptEnrollment(page, enrollmentId);`
       - Mở `/classes/${classAId}` → tab `"Buổi học & luyện tập"` → bấm `Tài liệu buổi` trên dòng `session-row` đầu tiên.
       - Chạy `Promise.all` đợi `PUT /api/classes/${classAId}/sessions/${today}/materials/files` (`201`) cùng `sessionDialog.getByLabel("Chọn file tải lên cho buổi học").setInputFiles({ name: PDF_NAME, mimeType: "application/pdf", buffer: pdfBytes })`. Khẳng định `PDF_NAME` hiện trong modal.
       - Bấm `"Chọn từ ngân hàng"`, bấm `"Gắn " + MP3_NAME`, bấm `"Quay lại"`, khẳng định cả `PDF_NAME` và `MP3_NAME` hiển thị trong modal buổi học; mở lại `/materials` khẳng định cả hai mục hiện `"Dùng ở 1 buổi"`.
  3. Cài đặt kiểm thử cho phía học viên đa-org & phân quyền `?org=` (E5–E6):
     - **Thiết lập Org B mới hơn Org A (chống test giả dương):** Chờ `30ms` (`await new Promise((r) => setTimeout(r, 30))`), mở context giáo viên B, gọi `signUpViaApi(teacherBPage, { name: \`Trung tâm Beta \${stamp}\` })`, rồi gọi `await seedStudent({ teacherEmail: teacherBEmail, name: "Học viên Đa Org", email: studentEmail, onboarded: true })`. Lúc này `rows` của `studentEmail` sắp theo `created_at DESC` có `rows[0]` = **Org B** và `rows[1]` = **Org A**. Đóng context giáo viên B.
     - **E5 (Học viên đa-org mở/phát/tải qua `?org=`):** Mở `studentContext`, đăng ký tài khoản thật cho `studentEmail` tại `${STUDENT_ORIGIN}/login` (`#tab-signup`) và gọi `verifyStudentEmailFromMailLog(studentPage, studentEmail)`, đợi URL về `${STUDENT_ORIGIN}/`.
       - *Precondition & Negative control:* Khẳng định `[data-testid='org-switcher-trigger']` hiển thị tên `Trung tâm Beta` (org mặc định `rows[0]`), và gọi `studentPage.request.get(\`${API_ORIGIN}/api/student/classes/\${classAId}/sessions/\${today}/materials/\${mp3MaterialId}/file\`)` (có cookie phiên nhưng **không** có `?org=` và **không** có `x-student-org-id`) trả về `404` — chứng minh nếu thiếu `?org=`, server rơi về `rows[0]` (Org B) và chặn truy cập.
       - *Chuyển sang Org A:* Bấm `[data-testid='org-switcher-trigger']`, trong `[data-testid='org-switcher-menu']` bấm `getByRole("menuitem", { name: new RegExp(\`Trung tâm Alpha \${stamp}\`) })`. Bấm vào card lớp `Lớp Tài liệu ${stamp}` để vào `${STUDENT_ORIGIN}/classes/${classAId}`.
       - *Bung mục Tài liệu:* Bấm `studentPage.getByRole("button", { name: "Tài liệu" }).first()` (do `sessionsTotal: 1` nên có đúng 1 buổi), đợi danh sách `[data-testid='lesson-material']` hiện đủ 2 mục (`MP3_NAME` và `PDF_NAME`).
       - *Khẳng định `?org=`, phát `<audio>`, popup «Mở» và tải «Tải»:*
         1. Kiểm tra thuộc tính `src` của `studentPage.locator("audio").first()` và `href` của `studentPage.getByRole("link", { name: \`Tải \${PDF_NAME}\` })` đều chứa `org=${encodeURIComponent(orgAId)}`.
         2. Gọi `studentPage.locator("audio").first().evaluate((el: HTMLAudioElement) => el.load())` và dùng `expect.poll` xác nhận `readyState >= 1 && error === null`.
         3. Gắn listener console lên `studentContext` trước khi click, rồi bấm `studentPage.getByRole("link", { name: \`Mở \${MP3_NAME}\` })` cùng `studentPage.waitForEvent("popup")` và `studentContext.waitForEvent("response", ...)`; xác nhận URL popup chứa `org=${encodeURIComponent(orgAId)}`, response status `200`, `readyState >= 1`, `error === null`, 0 lỗi CSP/CORS. Đóng popup.
         4. Bấm `studentPage.getByRole("link", { name: \`Tải \${PDF_NAME}\` })` cùng `studentPage.waitForEvent("download")`; xác nhận `download.suggestedFilename() === PDF_NAME` và byte tải về khớp hệt `pdfBytes`.
     - **E6 (Học viên không thuộc lớp bị chặn 404):** Tạo `otherStudentEmail` chỉ được `seedStudent` vào Org B (`onboarded: true`), đăng ký + xác thực trên `otherStudentContext`. Gọi `otherPage.request.get` tới cả URL danh sách `/api/student/classes/${classAId}/sessions/${today}/materials` lẫn URL file `.../${mp3MaterialId}/file` (cả khi không truyền `?org=` lẫn khi truyền `?org=${orgAId}` — trường hợp sau `createStudentGuard` không tìm thấy `orgAId` trong hồ sơ của `otherStudent` nên rơi về `rows[0]` là Org B và `resolveSession` chặn enrollment) đều trả `404`.
- **Success criteria:** File `apps/e2e/specs/material-upload-student.spec.ts` sạch lỗi lint/type và thực thi đầy đủ E1–E6.
- **Verify:** `pnpm check-types && pnpm exec biome check apps/e2e/specs/material-upload-student.spec.ts` thoát với mã `0`.

### Task 2.2 — Cập nhật `CHANGELOG.md` và chạy kiểm chứng E2E + toàn bộ cổng chất lượng local
- **Goal:** Ghi nhận thay đổi vào `CHANGELOG.md` theo quy ước repo, chạy spec E2E mới cùng `material-bank.spec.ts` trên stack preview đầy đủ (port `8100/8101/8103/8104/8105`), sau đó chạy toàn bộ cổng lint, typecheck và unit test của repo.
- **Target files and symbols:**
  - `/root/projects/worktrees/teacher-os-647-materials-upload-student-e2e/CHANGELOG.md` (thêm mục `## 2026-11-11` với `### Changed` và `### Fixed` dẫn chiếu `(#647)`).
  - `apps/e2e/specs/material-upload-student.spec.ts`, `apps/e2e/specs/material-bank.spec.ts`.
- **Steps:**
  1. Cập nhật `CHANGELOG.md` thêm mục `## 2026-11-11`:
     - `### Fixed`: Sửa `Content-Security-Policy` trên phản hồi file media `inline` của ngân hàng/buổi học để nút «Phát» (giáo viên) và «Mở» (học viên) phát được trực tiếp trong tab mới mà vẫn khoá script, kèm `COOP: same-origin` và `Referrer-Policy: no-referrer` (#647).
     - `### Changed`: Hạ trần dung lượng upload audio/video của tài liệu từ 100 MiB xuống 95 MB (`95 MiB`) để nằm dưới giới hạn request body 100 MB của Cloudflare Free/Pro edge; bổ sung E2E upload file thật (`PUT` raw body, CORS preflight, `X-File-Name`) và học viên đa-org mở/tải tài liệu qua `?org=` (#647).
  2. Chạy Playwright với port override chuẩn của repo:
     `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/material-bank.spec.ts specs/material-upload-student.spec.ts`
  3. Chạy toàn bộ cổng local của repo:
     `pnpm exec biome check . && pnpm check-types && pnpm test`
- **Success criteria:** Cả 2 file spec E2E pass 100% không retry/flake; `biome check`, `check-types` và `pnpm test` toàn repo thoát `0`.
- **Verify:** `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/material-bank.spec.ts specs/material-upload-student.spec.ts && pnpm exec biome check . && pnpm check-types && pnpm test` thoát với mã `0`.

## Todo
- [ ] Task 2.1: Viết `apps/e2e/specs/material-upload-student.spec.ts` phủ đủ E1–E6 (upload PUT, CORS preflight dương/âm, Phát popup CSP, học viên đa-org `?org=`, chặn 404)
- [ ] Task 2.2: Cập nhật `CHANGELOG.md`, chạy pass E2E (`material-bank.spec.ts` + `material-upload-student.spec.ts`) và toàn bộ cổng `biome check`, `check-types`, `pnpm test`

## Verification
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/material-bank.spec.ts specs/material-upload-student.spec.ts` (thoát 0)
- `pnpm exec biome check .` (thoát 0)
- `pnpm check-types` (thoát 0)
- `pnpm test` (thoát 0)

## Success Criteria
- 6 kịch bản E1–E6 pass ổn định trên stack build preview thật.
- Chứng minh bằng negative control ngay trong E2E rằng thiếu `?org=` trả 404 và có `?org=` trả 200 đúng nội dung file.
- Chứng minh popup «Phát» và «Mở» nạp được `<video>`/`<audio>` (`readyState >= 1`, `error === null`) dưới header `INLINE_MEDIA_CSP` thật của server Hono.
- `CHANGELOG.md` phản ánh đầy đủ bản sửa CSP và trần 95 MB (#647).

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
