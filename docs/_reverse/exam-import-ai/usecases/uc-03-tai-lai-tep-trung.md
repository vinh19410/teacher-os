# UC-03 — Tải lại tệp trùng (0 Credit)

**a) Mô tả & Actor.** Người dùng thả một tệp đã từng bóc tách thành công trong cùng tổ chức; hệ thống phát hiện theo mã băm nội dung, không gọi AI, không tạo job, không giữ/trừ Credit và đưa đường mở lại bản nháp cũ. Actor chính: teacher/owner.

**b) Điều kiện tiên quyết.** Tồn tại job `completed` cùng org, cùng `content_fingerprint`, có `draft_json` đọc được (`dedupe.ts:24-63`). Job `failed_refunded`/`processing`/completed-mất-draft không tính trùng.

**c) Kích hoạt.** Chọn/kéo tệp vào dropzone (client hash) HOẶC POST đến server với tệp trùng (bỏ qua lookup: tab cũ, lỗi mạng).

**d) Luồng chính — lớp 1 (lookup trước upload).**
1. Client SHA-256 tệp (`file-fingerprint.ts:4-23`). Hash lỗi → fail-open sang luồng POST.
2. GET `/api/exam-imports/lookup?fingerprint=` — gate role như POST (`exam-imports.ts:348-370`).
3. Trúng → banner "Phát hiện tệp trùng mã băm" + nút "Mở lại bản nháp cũ (0 Cr)"; không upload (`import.tsx:247-259`).

**d) Luồng chính — lớp 2 (POST tự chặn).**
1. POST chạy sau khi kiểm tệp; fingerprint server-side; tra trùng TRƯỚC ensureWallet/INSERT/reserve (`exam-imports.ts:264-275`).
2. Trúng → 200 `{duplicateOf:{jobId,title,completedAt}}` — 0 đụng AI/R2/ví/log.
3. UI phân biệt union bằng key `duplicateOf` → cùng banner (`repos/exam-imports.ts:78-88`).

**d) Mở lại.** Bấm nút → navigate `?job=<jobId cũ>` (không clone job) → UC-02 (`import.tsx:396-426`, `duplicate-exam-banner.tsx`).

**e) Luồng thay thế.**
- e1 Lookup/hash lỗi (mạng, non-secure context) → fail-open: upload thẳng như UC-01; lớp POST vẫn bảo đảm 0 Credit (`import.tsx:260-265`, `file-fingerprint.ts:4-16`).
- e2 Cùng byte ở org khác → không trùng, bóc tách bình thường (`exam-imports.test.ts:1195-1203`).
- e3 Tie nhiều job trùng → chọn deterministic `completed_at DESC, started_at DESC, id` (`dedupe.ts:40-45`).

**f) Hậu điều kiện.** Không có row mới, không có log mới, ví nguyên vẹn; người dùng đang mở đúng bản nháp cũ.

**g) Quy tắc nghiệp vụ & Lỗi.** BR-003. Không có lỗi nghiệp vụ riêng (thiết kế 0 Credit tuyệt đối).

**h) Nguồn.** `apps/server/src/lib/exam-import/dedupe.ts`; `apps/web/src/lib/file-fingerprint.ts`; `apps/web/src/components/exam-import/duplicate-exam-banner.tsx`; test: `exam-imports.test.ts:1084-1238`; `dedupe.test.ts:78-188`; e2e `ai-exam-import-ac-002.spec.ts:14-104`; `import.test.tsx:349-444`.
