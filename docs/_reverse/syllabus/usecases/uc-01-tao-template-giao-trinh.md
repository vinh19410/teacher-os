# UC-01 — Tạo template giáo trình (form)

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-01 |
| Tên | Tạo template giáo trình bằng form |
| Mục tiêu | GV có một giáo trình mẫu dùng chung của org để nhập vào các lớp sau này |
| Mức | User-goal |
| Kích hoạt | Bấm "+ Tạo syllabus" trên `/syllabus` (apps/web/src/routes/_auth/syllabus/index.tsx:48) |
| Nguồn chính | apps/web/src/components/modals/add-syllabus-modal.tsx:88-124; apps/server/src/routes/syllabus.ts:142-196; packages/api/src/contracts.ts:204-246 |

## b. Actors

- **Chính:** Giáo viên (người, cùng org) — ✅
- **Phụ:** Kernel command bus (hệ thống), D1 batch (hệ thống) — ✅

## c. Điều kiện tiên quyết

- GV đã đăng nhập, có kernel context org (`ctx.orgId`) — apps/server/src/routes/syllabus.ts:143-144.
- (Không yêu cầu có lớp hay template sẵn nào.)

## d. Luồng chính

1. GV bấm "+ Tạo syllabus" → modal mở. ✅ [S7:48][S14:133-137]
2. Hệ thống hiển thị form: Tên (bắt buộc), Loại lớp (IELTS/Giao tiếp), Trình độ (Band 5.5–7.5+), Kỹ năng (chỉ khi IELTS), Mô tả, Số buổi dự kiến (mặc định 10). ✅ [S14:37-42, 139-236]
3. GV điền và bấm "Tạo". ✅ [S14:260-266]
4. Client kiểm: tên rỗng → "Vui lòng nhập tên syllabus."; IELTS mà 0 kỹ năng → "Chọn ít nhất một kỹ năng."; đang parse/file lỗi → chặn submit. ✅ [S14:86-101, 263]
5. Command bus POST `/api/syllabus-templates` với `syllabusCreateSchema`. ✅ [S12:83-90][S6:204-217]
6. Server zod-validate: cap 500 node ("Tổng số module và buổi học vượt giới hạn 500"), IELTS cần ≥1 kỹ năng, Giao tiếp không kỹ năng; body > 2 MiB → 413. ✅ [S6:218-244][S1:730-735]
7. Server sinh UUID, ghi MỘT batch: syllabus + (tuỳ chọn) modules + lessons theo vị trí 0..n. ✅ [S1:150-194]
8. Trả 201 `{id}`; client refresh snapshot; modal đóng, reset form, navigate tới trang chi tiết của id vừa tạo. ✅ [S1:195][S14:117-123][S47:89]

## e. Luồng thay thế

- **A1 — Tạo kèm nội dung bulk từ file:** xem UC-02 (modules trong cùng payload). ✅ [S6:216][S14:111-115]
- **A2 — Lưu thành công nhưng snapshot chưa kịp confirm (committed):** client không đóng/navigate mù; hiển thị notice cho phép "reconcile" rồi mới đóng. ✅ [S14:119-123, 126-131][S52:31-44]
- **A3 — Đóng modal giữa chừng:** dữ liệu đã nhập được giữ khi mở lại (Hủy/Esc/overlay). ✅ [S36:98-144][S47:137]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| Body không phải JSON | 400 `{"error":"invalid json"}` | apps/server/src/routes/syllabus.ts:62-66 | ✅ |
| Zod fail | 400 `{"error":"invalid body"}` (opaque) | apps/server/src/routes/syllabus.ts:67-71 | ✅ |
| Trên 500 node | 400 kèm message "Tổng số module và buổi học vượt giới hạn 500" | packages/api/src/contracts.ts:219-230 | ✅ |
| IELTS thiếu kỹ năng / Giao tiếp có kỹ năng | 400 kèm message "Syllabus IELTS cần ít nhất một kỹ năng" / "Syllabus Giao tiếp không chọn kỹ năng" | packages/api/src/contracts.ts:231-244 | ✅ |
| Body > 2 MiB | 413 "Dữ liệu syllabus vượt giới hạn 2 MiB." | apps/server/src/routes/syllabus.ts:730-735 | ✅ |
| Thiếu kernel ctx | 401 `{"error":"unauthorized"}` | apps/server/src/routes/syllabus.ts:51-53, 143-144 | ✅ |

## g. Hậu điều kiện

- Template mới tồn tại với `class_id = NULL`; xuất hiện trong snapshot `syllabi` và danh sách `/syllabus`. ✅ [S26:314-326][S10:101-103]
- Nếu có modules: cây module/lesson đầy đủ, position 0..n-1, status theo payload (mặc định upcoming), kind mặc định lesson. ✅ [S1:166-193][S6:196-197]

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-syllabus-012 (kỹ năng theo loại lớp). ✅
- Test: apps/web/src/components/modals/syllabus-content-modals.test.tsx:108 (AddSyllabusModal), apps/web/src/routes/_auth/syllabus/index.test.tsx:82-136 (mở sau khi refresh; không navigate khi snapshot chưa confirm; giữ state), apps/e2e/specs/syllabus-excel-csv-import.spec.ts:98-144. Không có test skip/todo. ✅
- Ghi chú: server không sinh `id` từ client — payload `id: ""` client gửi bị bỏ qua, id là `crypto.randomUUID()` phía server. ✅ [S14:105][S1:150]
