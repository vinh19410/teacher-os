# UC-06 — Phục hồi bản nháp soạn thảo

Repo: /root/projects/teacher-os @ develop d6c0f6b5.

**a. Mô tả ngắn.** Khi rời trang giữa chừng, nội dung đang soạn đã được autosave trên máy giáo viên; quay lại có banner "Đã phục hồi bản nháp" với Tiếp tục/Hủy — `apps/web/src/lib/assignment-draft-store.ts:133-183`; `apps/web/src/routes/_auth/assignments/new.tsx:774-785`.

**b. Actor.** Chính: Giáo viên. Dữ liệu: localStorage `assignment-draft` (schemaVersion 1, TTL 7 ngày, cap 512KB).

**c. Tiền điều kiện.** Trước đó đã soạn ở chế độ tạo (không autosave ở chế độ sửa); draft còn hạn và đúng schema-version.

**d. Hậu điều kiện.** Tiếp tục: form chứa nội dung phục hồi, draft item bị xóa khỏi storage (đã lên form). Hủy: form trắng trạng thái sẵn sàng, draft xóa.

**e. Kịch bản chính.**

| Bước | Actor | Hệ thống | Nguồn |
|------|-------|----------|-------|
| 1 | Soạn | Mỗi thay đổi, sau 1000ms im lặng: `saveAssignmentDraft` (nếu `composerDraftHasContent`) | `new.tsx:687-699`; `assignment-draft-store.ts:133-152,201-232` |
| 2 | Đóng tab/reload | Draft nằm lại localStorage | — |
| 3 | Mở lại "Tạo đề mới" | `readAssignmentDraft` (không phá hủy): kiểm schemaVersion, TTL 7 ngày | `assignment-draft-store.ts:159-183` |
| 4 | — | Banner "Đã phục hồi bản nháp" + preview đề khôi phục | `new.tsx:774-785` |
| 5 | Chọn "Tiếp tục chỉnh sửa" | Nạp draft vào form; xóa draft storage | `:786-804` |

**f. Luồng thay thế/ngoại lệ.**
- A1 — Chọn "Hủy, bắt đầu mới": `resetAll`, form trắng, draft xóa.
- A2 — Draft hết hạn/sai version: xóa im lặng, form mới không banner.
- A3 — Draft vượt 512KB: bỏ autosave + console.warn (E-020), không mất gì trên form.
- A4 — Vừa quay lại từ Xem trước: preview draft thắng, không hiện banner phục hồi (`:556-568`).
- A5 — Lưu thành công trên server sau đó: draft bị xóa (`:969-978`).

**g. Ràng buộc/NFR.** Giới hạn 512KB/7 ngày (OQ-11); per-browser (không đồng bộ thiết bị khác — tự nhiên vì localStorage).

**h. Truy vết.** FR-010; E-020; Flow F5; Test: E2E create autosave :380-435; unit `assignment-draft-store` (assert trong `new.test.tsx`).
