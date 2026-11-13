# UC-02 — Lưu bản nháp riêng tư

Repo: /root/projects/teacher-os @ develop d6c0f6b5.

**a. Mô tả ngắn.** Giáo viên lưu đề chưa hoàn thiện với trạng thái "Bản nháp"; bản nháp không hiện khi giao bài từ trang Lớp học — `apps/web/src/routes/_auth/assignments/new.tsx:375-382`; `apps/server/src/routes/kernel.ts:1540-1542`.

**b. Actor.** Chính: Giáo viên. Phụ: command bus (như UC-01).

**c. Tiền điều kiện.** Như UC-01; nội dung phải đủ tầng tối thiểu của skill kể cả khi draft (writing cần prompt; reading cần passage + ≥1 câu; listening/grammar/vocab cần ≥1 câu — `packages/api/src/contracts.ts:926-976`).

**d. Hậu điều kiện.** Thành công: row `status="draft"` (hoặc giữ draft khi sửa); nhãn "Bản nháp" trong danh sách; không bị gate đáp án/ảnh/audio. Thất bại: form giữ + thông báo.

**e. Kịch bản chính.**

| Bước | Actor | Hệ thống | Nguồn |
|------|-------|----------|-------|
| 1 | Soạn một phần nội dung | Autocomplete catalog, field errors vẫn mirror những gì cứng (stem/bank/ảnh) | `apps/web/src/routes/_auth/assignments/new.tsx:700-743` |
| 2 | Chọn "Lưu bản nháp" | Gate `missingRequirementsFor` theo status=draft (ít mục hơn ready) | `:141-305` |
| 3 | Bấm Lưu | POST/PATCH với `status:"draft"`; server vẫn schema strict (max length, enum) nhưng bỏ rule ready | `packages/api/src/contracts.ts:874-898` |
| 4 | — | Card "Đã lưu bản nháp" | `apps/web/src/components/assignments/create-success-card.tsx:53-63` |
| 5 | — | Danh sách hiện nhãn "Bản nháp" (ưu tiên trên "Đã dùng" — Conflict-1) | `apps/web/src/components/assignments/assignment-status.ts:198-206` |

**f. Luồng thay thế/ngoại lệ.**
- A1 — Thiếu cả tầng tối thiểu của draft (vd writing chưa có prompt): E-015, focus mục thiếu.
- A2 — Draft vướng rule item-level vẫn chạy (bank ≥2 mục khi có bank items, stem gap đúng 1 chỗ trống nếu câu gap có nội dung): E-005 nếu gửi lên; client mirror hiển thị trước. `packages/api/src/contracts.ts:1060-1123`.
- A3 — Đề gộp kèm Writing khi lưu draft: BR-010 áp như thường (writing prompt bắt buộc).
- A4 — Bản nháp bị autosave cục bộ theo UC-06; sau khi lưu server, draft bị xóa.

**g. Ràng buộc/NFR.** BR-002 (enum status); BR-019 (đề nằm trong ngân hàng riêng tư org).

**h. Truy vết.** FR-003/004/010; BR-002/007/010/011/012; E-005/015/018; Flow F2/F5; Test: E2E create draft flow `assignment-prompt-create.spec.ts:70-90`.
