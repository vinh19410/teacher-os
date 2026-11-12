# UC-05 — Xem trước góc nhìn học viên

Repo: /root/projects/teacher-os @ develop d6c0f6b5.

**a. Mô tả ngắn.** Giáo viên xem đề ở dạng bài giấy học viên + tab mô phỏng làm bài, dùng cho cả đề đang soạn (handoff sessionStorage) và đề đã lưu (`?id=`) — `apps/web/src/routes/_auth/assignments/preview.tsx:19-66`.

**b. Actor.** Chính: Giáo viên.

**c. Tiền điều kiện.** Có đề đang soạn trong form, hoặc đề tồn tại trong snapshot.

**d. Hậu điều kiện.** Không đổi dữ liệu server; bài làm mô phỏng KHÔNG được lưu (FR-006).

**e. Kịch bản chính.**

| Bước | Actor | Hệ thống | Nguồn |
|------|-------|----------|-------|
| 1a | Bấm "Xem trước" trong form soạn | savePreviewDraft vào sessionStorage (kèm promptId nếu đang sửa), điều hướng `/assignments/preview` | `new.tsx:394-421`; `assignment-preview-draft.ts:57-78` |
| 1b | Bấm "Xem trước" từ aside/danh sách | Điều hướng `/assignments/preview?id=...` | `prompt-preview-aside.tsx:213-234` |
| 2 | — | Preview đọc draft (không xóa) hoặc tìm prompt trong snapshot theo id | `preview.tsx:19-66` |
| 3 | Xem bài giấy + mở tab "làm thử" | Render theo loại câu (choice/grid/pin/bank); explanation không hiện ở tab đang làm | `assignment-prompt-create.spec.ts:92-140,608-767` |
| 4 | Bấm "Quay lại soạn đề" | takePreviewDraft: đọc rồi xóa; form khôi phục nguyên vẹn | `assignment-preview-draft.ts:70-78` |

**f. Luồng thay thế/ngoại lệ.**
- A1 — Vào preview?id không có id hoặc prompt không còn: trạng thái rỗng.
- A2 — Vừa quay lại từ preview: preview draft thắng banner phục hồi localStorage (F5, độ ưu tiên — `new.tsx:556-568`).
- A3 — Đề reading có explanation: hiện ở bài giấy/review, không leak vào payload làm bài (E2E đếm TRUE = 0 — `assignment-prompt-create.spec.ts:192`).

**g. Ràng buộc/NFR.** Preview draft sống trong 1 tab phiên (sessionStorage).

**h. Truy vết.** FR-006/020; Flow F4; Test: E2E create preview :92-140, :437-474; web `preview.test.tsx` 12 test.
