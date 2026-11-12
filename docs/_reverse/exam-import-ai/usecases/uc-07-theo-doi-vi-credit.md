# UC-07 — Theo dõi ví Credit (trên màn Nhập đề AI)

**a) Mô tả & Actor.** Người dùng thấy đơn giá dịch vụ ("Chi phí: 5 Credit (Tạm giữ)") và số dư ví org ("Ví: N Cr"); badge tự refresh sau khi job xong/lỗi. Actor: mọi thành viên org (endpoint ví không gate role nhập đề).

**b) Điều kiện tiên quyết.** Đã đăng nhập; đang ở màn import (badge là consumer chính trong feature).

**c) Kích hoạt.** Mở màn import; hoặc kết thúc một lượt upload/retry (xong hoặc lỗi).

**d) Luồng chính.**
1. GET `/api/credits/wallet` — chạy sweep lười (job import + grading), tạo ví lười 30 Credit nếu org chưa có, trả `{balance, held, available = balance − held}` (`credits.ts:23-44`, `wallet.ts:84-93`).
2. Badge hiển thị đơn giá từ `CREDIT_COSTS.examImport` + balance; ví chưa load → "Ví: …" (`credit-cost-badge.tsx:14-30`).
3. Sau job: `refreshWallet()` gọi lại để đồng bộ (đã trừ 5 / đã hoàn) (`import.tsx:114-124, 177, 194`).

**e) Luồng thay thế.**
- e1 Ví load thất bại → badge "…", không chặn luồng chính (`import.tsx:117-120`).
- e2 Org mới lần đầu xem → tự có 30 Credit Dùng thử (BR-011).

**f) Hậu điều kiện.** Người dùng nhìn thấy đúng khả dụng trước/sau tiêu; không thay đổi dữ liệu ngoài lazy wallet + sweep.

**g) Quy tắc nghiệp vụ & Lỗi.** BR-001, BR-011. (Lỗi E-001 hiển thị ở UC-01.)

**h) Nguồn.** `apps/server/src/routes/credits.ts`; `apps/web/src/components/exam-import/credit-cost-badge.tsx`; `apps/web/src/lib/repos/exam-imports.ts:221-232`; test: `exam-imports.test.ts:445-458`; `import.test.tsx:141-160`; e2e `ai-exam-import-ac-001.spec.ts:27-29, 52-56`.
