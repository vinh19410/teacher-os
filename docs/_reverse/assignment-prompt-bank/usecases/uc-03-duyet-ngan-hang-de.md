# UC-03 — Duyệt ngân hàng đề

Repo: /root/projects/teacher-os @ develop d6c0f6b5.

**a. Mô tả ngắn.** Giáo viên xem danh sách đề của org, lọc theo kỹ năng/phần thi, tìm theo tiêu đề/nguồn/tên dạng, xem nhãn trạng thái và số lớp đã dùng — `apps/web/src/routes/_auth/assignments/index.tsx:246-257,416-525`.

**b. Actor.** Chính: Giáo viên. Phụ: kernel snapshot (nguồn dữ liệu danh sách — KHÔNG phải GET /api/assignments, đó là grading legacy — `apps/server/src/routes/assignments/index.ts:103-108`).

**c. Tiền điều kiện.** Snapshot đã tải (assignmentPrompts không rỗng hoặc trạng thái rỗng tường minh).

**d. Hậu điều kiện.** Không đổi dữ liệu; có thể dẫn sang UC-04 (Chỉnh sửa), UC-05 (Xem trước), hoặc feature classes (Giao).

**e. Kịch bản chính.**

| Bước | Actor | Hệ thống | Nguồn |
|------|-------|----------|-------|
| 1 | Mở `/assignments` | Danh sách đề order createdAt giảm dần; "Đang hiện X / Y đề" | `index.tsx:246-257,416-438` |
| 2 | Gõ ô tìm kiếm | Debounce 300ms, đẩy `?q=` vào URL | `:147-159,30-45` |
| 3 | Bấm chip kỹ năng / phần | `?skill=&part=`; chip có số đếm theo query hiện tại | `:47-55,105-159,175-211` |
| 4 | Xem hàng đề | Nhãn: "Bản nháp" / "Đã dùng N lớp" / "Sẵn sàng"; band; ngày tạo VN | `assignment-status.ts:198-206,62-81` |
| 5 | Bấm hàng | Mở preview aside với nút "Xem trước"/"Chỉnh sửa" | `prompt-preview-aside.tsx:213-234` |

**f. Luồng thay thế/ngoại lệ.**
- A1 — Không có đề nào: trạng thái rỗng mời tạo đề (`:290-303,443-452`).
- A2 — Bộ lọc không khớp: trạng thái "không kết quả" + nút xóa lọc.
- A3 — Đề legacy thiếu skill/part/type: fallback suy từ task/genre (`:58-65`).
- A4 — Đề demo/library không xuất hiện (BR-019) — ẩn theo thiết kế.

**g. Ràng buộc/NFR.** BR-018 (đếm theo lớp distinct); không phân trang (Gap-2/OQ-3).

**h. Truy vết.** FR-005/012; BR-017/018/019; Test: E2E `assignment-bank.spec.ts:9-120`; web `index.test.tsx` 11 test.
