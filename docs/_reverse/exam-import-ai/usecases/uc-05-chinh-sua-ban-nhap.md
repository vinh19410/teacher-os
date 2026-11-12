# UC-05 — Chỉnh sửa bản nháp (0 Credit)

**a) Mô tả & Actor.** Người dùng sửa tay tên đề, kỹ năng, thời gian, đoạn văn (rich text) và từng câu hỏi (stem, phương án, đáp án, giải thích, loại) trên cột phải; lưu bằng PATCH — không đụng ví. Server hợp nhất để nhãn "Cần rà soát lại" không bao giờ tự biến mất. Actor chính: teacher/owner.

**b) Điều kiện tiên quyết.** Job `completed` (`exam-imports.ts:619-627`); role nhập đề; Origin hợp lệ + Content-Type JSON.

**c) Kích hoạt.** Người dùng thay đổi input rồi bấm "Lưu bản nháp" (`exam-import-actions.tsx:33-45`).

**d) Luồng chính.**
1. Panel giữ draft cục bộ; đổi draft → reset xác nhận cũ (`extracted-exam-panel.tsx:77-99`).
2. PATCH `/api/exam-imports/:id/draft` body `{draft}` (`repos/exam-imports.ts:260-278`).
3. Server: 401/403/CSRF → 404 nếu job lạ → 409 nếu chưa completed → parse JSON 400 → schema 422 (`exam-imports.ts:590-658`).
4. Merge `mergeReviewedDraft`: giữ `confidence` gốc theo vị trí; `needsReview` = OR(gốc DB, client, tính lại cho câu mới) — client không hạ được nhãn; xóa bớt câu để hạ về 0 bị gán lại nhãn câu đầu (`publish-to-bank.ts:77-124`).
5. UPDATE `draft_json` + `updatedAt` (không đụng `credit_wallet`/log) → trả job DTO (`exam-imports.ts:660-677`).
6. UI: "Đã lưu bản nháp (0 Credit)." (`import.tsx:290-307`).

**e) Luồng thay thế.**
- e1 Chưa completed → 409 INVALID_STATE (UI hiện "Không thể lưu bản nháp. Vui lòng thử lại.").
- e2 Draft lệch schema → 422 INVALID_DRAFT (UI cùng fallback lưu nháp).
- e3 Origin lạ → 403; Content-Type không JSON → 415 (`exam-imports.ts:141-154`).

**f) Hậu điều kiện.** `draft_json` cập nhật; `import_status` giữ `completed`; nhãn rà soát được bảo toàn; 0 dòng sổ cái mới.

**g) Quy tắc nghiệp vụ & Lỗi.** BR-005; E-409-state, E-draft, E-403-role.

**h) Nguồn.** `apps/server/src/routes/exam-imports.ts:585-678`; `apps/server/src/lib/exam-import/publish-to-bank.ts:63-137`; test: `exam-imports.test.ts:744-799`; `publish-to-bank.test.ts:130-151`; `import.test.tsx:500-540`.
