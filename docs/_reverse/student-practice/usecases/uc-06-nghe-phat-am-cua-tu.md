---
feature: student-practice
type: reverse-usecase
uc: UC-06
status: draft
updated: "2026-11-12"
---

# UC-06 — Nghe phát âm của từ

a. **Mục tiêu:** Học viên nghe từ (thường/chậm) trong prompt hoặc trang từ để luyện
   nghe-chọn và tự đọc. 🟡 (mục tiêu phụ, không có đặc tả riêng; OQ-15)
b. **Actor:** Học viên.
c. **Tiền điều kiện:** Từ có audioKey (kho media) hoặc audioUrl (thư viện); server có
   cấu hình kho media nếu đi đường audioKey.
d. **Luồng chính (truy vết F7):**
   1. Nhấn "Nghe" (hoặc "Nghe chậm" 0.6x) → GET /vocab/audio/:wordId.
   2. Đường libword-: chỉ trả khi học viên có thẻ của từ đó; đường org: qua access
      predicate của deck.
   3. Proxy xa: https + host allowlist, ≤3 redirect, audio/*, ≤5 MB, timeout 10 s →
      buffer kèm nosniff + sandbox, cache riêng tư 1 ngày (NFR-08).
e. **Luồng thay thế:**
   - 2a. Không phải thẻ của mình / không có âm thanh / upstream lỗi → đồng nhất
     404 E-15 (chống dò — INF-3).
   - 2b. Thiếu cấu hình kho media → 503 E-14.
   - 3a. Lỗi audio trong phiên → skip không phạt (BR-14).
f. **Hậu điều kiện:** Không đổi dữ liệu; response cache được phía client 1 ngày (private).
g. **Quy tắc liên quan:** NFR-08; BR-14.
h. **Truy vết:** apps/server/src/routes/vocab.ts:167-287, :1163-1245;
apps/student/src/components/vocab/vocab-pronunciation-buttons.tsx:7-20;
apps/server/src/routes/vocab.test.ts:699-812.
