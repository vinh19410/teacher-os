# UC-06 — Lưu vào Ngân hàng đề (publish)

**a) Mô tả & Actor.** Người dùng xuất bản bản nháp đã rà soát thành bộ đề của tổ chức: 1 `assignment_prompt` mỗi part + `assignment_test` + `assignment_test_part` trong 1 batch nguyên tử; có cổng xác nhận các câu gắn nhãn và idempotent theo job. Actor chính: teacher/owner.

**b) Điều kiện tiên quyết.** Job `completed`; draft hợp lệ; còn câu nhãn thì phải tích xác nhận; kỹ năng không phải `mixed`; số part ≤ slot preset.

**c) Kích hoạt.** Bấm "Lưu vào Ngân hàng đề" (`exam-import-actions.tsx:33-52`) — UI khóa nút khi `reviewCount > 0 && !confirmed` kèm lý do `aria-describedby`.

**d) Luồng chính.**
1. UI tính `reviewCount` từ draft cục bộ; 0 nhãn → không hiện hộp kiểm, gửi `reviewConfirmed: true` sẵn (`extracted-exam-panel.tsx:87-94, 281-283`).
2. POST `/api/exam-imports/:id/publish` body `{draft, reviewConfirmed}` (`repos/exam-imports.ts:284-309`).
3. Server gate 2 lớp: đếm nhãn trên max(draft hợp nhất, draft gốc DB) — còn nhãn mà chưa xác nhận → 422 REVIEW_CONFIRMATION_REQUIRED (`publish-to-bank.ts:177-190`).
4. Kiểm mixed (422), số slot preset (422 TOO_MANY_PARTS kèm maxParts), câu hợp lệ qua `assignmentQuestionSchema` (422 INVALID_DRAFT kèm partIndex/questionIndex) (`publish-to-bank.ts:192-369`).
5. Idempotency: đã có `publishedTestId` còn tồn tại → draft không đổi trả testId cũ; draft đổi → cập nhật tại chỗ (xóa parts, upsert prompts, update test) (`publish-to-bank.ts:213-247, 390-508`).
6. ID tất định `test-import-<jobId>`/`prompt-import-<jobId>-<part>`; status = `draft` nếu listening, ngược lại `ready`; source = "AI import: <fileName>" (`publish-to-bank.ts:371-438`).
7. Batch 1 lần gồm toàn bộ statement + UPDATE job (`publishedTestId`, draft merge); lỗi PK do 2 publish song song → đọc lại winner trả idempotent (`publish-to-bank.ts:510-557`).
8. UI refresh kernel snapshot rồi điều hướng `/assignments/tests/<testId>`; thông báo "Đã xuất bản vào Ngân hàng đề." hoặc "Đã lưu bộ đề nháp — cần bổ sung file nghe trước khi giao bài." (`import.tsx:309-343`).

**e) Luồng thay thế.**
- e1 422 các loại → publishError hiển thị đúng câu nguyên văn (`import.tsx:546-559`).
- e2 2 publish song song → một bên thắng, bên kia trả cùng testId (`publish-to-bank.test.ts:219-288`).
- e3 Listening → test/prompt status `draft` (gate audio chưa có) (`publish-to-bank.ts:379-380`).

**f) Hậu điều kiện.** Bộ đề xuất hiện trong ngân hàng đề org; job lưu `publishedTestId`; publish lại không nhân bản.

**g) Quy tắc nghiệp vụ & Lỗi.** BR-004, BR-005, BR-007 (không liên quan credit), BR-008, BR-010; E-review, E-parts, E-mixed, E-draft, E-404, E-409-state.

**h) Nguồn.** `apps/server/src/lib/exam-import/publish-to-bank.ts:139-564`; `apps/server/src/routes/exam-imports.ts:680-776`; `apps/web/src/components/exam-import/review-confirmation.tsx`; test: `exam-imports.test.ts:800-1083`; `publish-to-bank.test.ts:130-357`; e2e `ai-exam-import-ac-003.spec.ts:16-112`.
