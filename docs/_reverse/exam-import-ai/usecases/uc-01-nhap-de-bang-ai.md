# UC-01 — Nhập đề thi bằng AI

**a) Mô tả & Actor.** Giáo viên hoặc Chủ trung tâm tải tệp đề PDF/ảnh; hệ thống kiểm tra tệp, tạm giữ 5 Credit, gọi AI bóc tách trong giới hạn 120 giây, chốt trừ khi có bản nháp hợp lệ và mở màn đối chiếu 2 cột. Actor chính: `teacher`/`owner`; Actor phụ: Workers AI (thực thi), Ví Credit (giữ/chốt), R2 (lưu file), TA/class_teacher (không được thực hiện — 403).

**b) Điều kiện tiên quyết.** (1) Người dùng đã đăng nhập teacher-app và có membership role `teacher`/`owner` (`role.ts:94-103`; student bị chặn 403 STUDENT_ON_TEACHER_APP `app.ts:227-234`). (2) Binding `AI` + kho `MEDIA` + cờ `AI_ENABLED="true"` và `VITE_AI_ENABLED="true"` (nếu không: CTA ẩn `import-with-ai-button.tsx:11`, POST 503 `exam-imports.ts:163-173`). (3) Tệp đạt: PDF/PNG/JPEG, ≤ 15 MB, PDF ≤ 20 trang, không mật khẩu.

**c) Kích hoạt (trigger).** Người dùng bấm CTA "Nhập đề bằng AI (5 Credit)" trên `/assignments/tests/new` rồi chọn/kéo tệp vào dropzone (`new.tsx:29`, `import.tsx` dropzone :435-440).

**d) Luồng chính.**
1. Dropzone kiểm tệp tại chỗ (MIME/size/trang/mật khẩu) — sai → ngừng, xem e). ✅ `exam-file-check.ts:28-104`
2. Client tính SHA-256 tệp và GET `/api/exam-imports/lookup` — trùng → ngừng, chuyển UC-03. ✅ `import.tsx:231-269`
3. POST `/api/exam-imports` gửi nguyên byte tệp, Content-Type = MIME tệp, header `X-File-Name`. ✅ `repos/exam-imports.ts:62-88`
4. Server kiểm MIME + Content-Length + tên file + byte thật khớp; kiểm sâu PDF bằng unpdf. ✅ `exam-imports.ts:178-259`
5. Server quét job treo (sweep) và tra trùng fingerprint — trùng → 200 `{duplicateOf}` (chuyển UC-03). ✅ `exam-imports.ts:262-275`
6. Tạo ví lười 30 Credit nếu org chưa có; gọi hook trần cá nhân (no-op). ✅ `exam-imports.ts:277-278`, `wallet.ts:88-93`
7. INSERT job `processing` (fileKey `exam-imports/<org>/<job>`, heldCredits 5) và reserve 5 Credit. ✅ `exam-imports.ts:283-325`
8. Lưu file lên R2, gọi AI: `toMarkdown` → LLM json_schema, timeout kép 120s. ✅ `run-import.ts:153-179`, `extractor.ts:169-229`
9. Hậu xử lý: gán `needsReview` (confidence < 0.8 / thiếu đáp án / opts < 2 / đáp án ngoài opts); 0 nhóm câu hợp lệ → thất bại (e). ✅ `run-import.ts:36-81`
10. Settle 5 Credit trước khi mark `completed` + ghi `draft_json`/`page_count`. ✅ `run-import.ts:186-216`
11. UI nhận job DTO, đẩy `?job=<id>` vào URL, refresh badge ví, hiển thị workspace 2 cột (hoặc 2 tab màn hẹp). ✅ `import.tsx:163-198, 452-498`

**e) Luồng thay thế/phân nhánh.**
- e1 Tệp sai ở client → alert E-003 + lý do cụ thể, không gọi API (`exam-file-dropzone.tsx:49-55, 111-122`).
- e2 Tệp sai ở server → 400 E-003 kèm `reason` (type/size/pages/password), không job/log/file (`exam-imports.ts:180-259`).
- e3 Thiếu Credit khi reserve → xóa job + file R2, 402 E-001 kèm balance/available → modal "Không đủ Credit" (`exam-imports.ts:306-325`, `insufficient-credits-dialog.tsx`).
- e4 AI lỗi/timeout/0 câu hợp lệ → release 5 Credit, job `failed_refunded` E-004 + reason → panel lỗi + nút retry (chuyển UC-04) (`run-import.ts:236-303`).
- e5 Settled rồi mới hỏng ghi job → 502 `EXAM_IMPORT_FAILED` (không dùng message E-004), Credit đã trừ (`exam-imports.ts:96-108`).
- e6 Tính năng chưa cấu hình → 503 DISABLED → ErrorNotice "Tính năng chưa cấu hình…" (`exam-imports.ts:163-173`).
- e7 Role không đủ / chưa đăng nhập → 403 / 401 (`exam-imports.ts:157-162`).

**f) Hậu điều kiện.** Thành công: job `completed` với draft + fingerprint; sổ cái có đúng cặp `reserved` −5 / `settled` −5; balance giảm 5, held về 0; UI ở `done` với URL `?job=`. Thất bại AI: cặp `reserved`/`released`, job `failed_refunded`; thất bại ví: không còn job/file nào.

**g) Quy tắc nghiệp vụ & Lỗi.** BR-001, BR-002, BR-003, BR-006, BR-011, BR-012, BR-013; lỗi E-001/E-003/E-004/E-hard/E-disabled/401/403 (wording nguyên văn xem Mục 6 spec + `_evidence.md` §3).

**h) Nguồn.** `apps/server/src/routes/exam-imports.ts:156-341`; `apps/server/src/lib/exam-import/run-import.ts`; `apps/server/src/lib/exam-import/extractor.ts`; `apps/web/src/routes/_auth/assignments/tests/import.tsx:163-269, 345-501`; test: `apps/server/src/routes/exam-imports.test.ts:265-546`; `apps/e2e/specs/ai-exam-import-ac-001.spec.ts:13-64`; `apps/web/src/routes/_auth/assignments/tests/import.test.tsx:205-242`.
