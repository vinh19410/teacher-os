---
type: reverse-gaps
feature: student-classes
status: draft
updated: "2026-11-12"
---

# student-classes — Khoảng trống & ranh giới

## 1. Khoảng trống nghiệp vụ (cần quyết định sản phẩm)

| ID | Khoảng trống | Bằng chứng hiện tại | OQ |
|----|--------------|---------------------|-----|
| GAP-sc-1 | Giả định một giáo viên mỗi tổ chức — chưa có giáo viên theo lớp dù bình luận code đã hẹn chuyển. Ảnh hưởng: ô "Giáo viên" và "Nhắn giáo viên" hiển thị sai nếu tổ chức có nhiều giáo viên. | apps/server/src/routes/student-class.ts:57-62; docs/_reverse/classes/classes-reverse-spec.md:31 | OQ-1 |
| GAP-sc-2 | Card lớp dùng số liệu kế thừa (tổng buổi/đã xong lưu sẵn), không khớp cơ chế "Buổi tới"/"Đã kết thúc" #395 của trang chi tiết. | apps/student/src/components/overview/class-card.tsx:244-265 so với apps/server/src/routes/student-class.ts:77-117 | OQ-2 |
| GAP-sc-3 | Tab Giáo trình tự nhóm theo chủ đề từ buổi học; không đọc giáo trình gốc nên không có mô tả/mục tiêu chương trình. | apps/student/src/components/class/class-detail-view.tsx:164-228 | OQ-3 |
| GAP-sc-4 | Schema lớp không có trường liên kết hội họp; CỘT `lesson.zoom` (lesson.ts:70, migration 0002 dòng 11) là liên kết hội họp phía giáo viên (apps/web render/sửa lịch) nhưng KHÔNG được chiếu vào cổng học viên (hợp đồng buổi học không có zoom; apps/student 0 hit) — học viên lớp Online vẫn không thấy chỗ vào buổi. | packages/db/src/schema/class.ts:10-41; quét âm tính §3 | OQ-4 |
| GAP-sc-5 | Trang lớp thuần chỉ đọc: không có xin nghỉ buổi, rời lớp, đề nghị dời lịch từ phía học viên. | apps/student/src/components/class/* không có thao tác ghi; S13 — apps/student/src/lib/repos/student.ts:396-445 | OQ-5 |
| GAP-sc-6 | "Nhắn giáo viên" chỉ mở trình soạn thư ngoài thiết bị; không có kênh nhắn trong app, không lưu lịch sử liên hệ. | apps/student/src/components/class/class-detail-view.tsx:273-281 | OQ-6 |
| GAP-sc-7 | Mốc "Buổi tới" trên THẺ THÔNG TIN (server) có thể rơi vào buổi nghỉ lễ; huy hiệu trên dải buổi thì không (client chỉ chọn `upcoming`). | apps/server/src/routes/student-class.ts:77-82; apps/student/src/components/class/class-lesson-list.tsx:13-49 | OQ-7 |
| GAP-sc-8 | Chưa có bộ chỉ số thành công cho cổng học viên. | Mục 7 của spec là đề xuất nhà phân tích | OQ-8 |

## 2. Khoảng trống kiểm thử

- Các thành phần hiển thị sau KHÔNG có test tự động riêng (chỉ được phủ một phần qua E2E): thẻ thông tin lớp, vòng tiến độ 4 ô, banner việc cần làm, tab Giáo trình, bảng bài tập. ✅ [negative-search: apps/student/src/components/class/ có 3 file test: class-lesson-list.test.tsx, classmates-tab.test.tsx, lesson-materials.test.tsx; E2E duy nhất apps/e2e/specs/student-class-detail.spec.ts:120-257]
- Nhánh dữ liệu không qua kiểm định hình dạng phía client (E-sc-007) chưa có test riêng. ✅ [negative-search trong S13/S12: không có test nào nhắm apps/student/src/lib/repos/student.ts:187-218 nhánh phân tích lỗi]

## 3. Quét âm tính (kết quả tìm-không-thấy)

- Không có test nào ở trạng thái skip/todo/.only/test.fails trong phạm vi (S4, S5, S6, S7, S8, S9, hai test component S11). ✅
- Không có consumer nào của các endpoint học viên trong app admin/app giáo viên (apps/web): tìm "student/classes" trả 0 kết quả. ✅
- Không có catalogue đa ngôn ngữ; mọi chuỗi hiển thị là hằng/thẳng tại chỗ phát sinh (quy tắc R2 áp dụng nguyên văn). ✅
- Không có trường liên kết hội họp trong schema lớp và hợp đồng học viên; cột `lesson.zoom` (phía giáo viên) không được chiếu vào cổng học viên (xem GAP-sc-4). ✅
- Không có thao tác ghi nào từ trang lớp (kèm nút tham gia lớp là ranh giới — SC-sc-03). ✅

## 4. Ranh giới bàn giao (hand-off)

| Ranh giới | Feature nhận | Điểm chạm |
|-----------|--------------|-----------|
| Kích hoạt ghi danh (nút "Tham gia lớp") | enrollment-lifecycle | apps/server/src/routes/student.ts:1300-1324; apps/student/src/components/overview/class-card.tsx:99-123 |
| Làm bài / nhận xét / điểm | student-quiz | apps/server/src/routes/student-class.ts:145-207 nối bản ghi làm bài vào bảng bài tập |
| Tài liệu buổi học | student-materials (chưa có bộ) | apps/student/src/components/class/class-lesson-list.tsx:204-211 |
| Trang lịch toàn khoá #584 | student-schedule (chưa có bộ) | apps/server/src/routes/student.ts:1116-1239 |
| Tổng quan portal, card lớp ở trang chủ | student-overview (chưa có bộ) | apps/student/src/components/overview/class-card.tsx |
| Nguồn trạng thái buổi (điểm danh, huỷ, nghỉ lễ) | attendance | apps/server/src/routes/student.ts:1069-1094; packages/db/src/schema/lesson.ts:49-68 |
| Hồ sơ học viên, auto-provision | auth-student-signup | apps/server/src/routes/student.ts:148-199 |
| Quản trị lớp phía giáo viên | classes (đã có bộ) | docs/_reverse/classes/classes-reverse-spec.md |

## 5. Bảng OQ tổng hợp

| OQ | Câu hỏi | Nhãn |
|----|---------|------|
| OQ-1 | Một giáo viên mỗi tổ chức — còn đúng không, khi nào chuyển giáo viên theo lớp? | 🟡 |
| OQ-2 | Hợp nhất số liệu card (kế thừa) với Buổi tới (#395) khi nào? | 🟡 |
| OQ-3 | Tab Giáo trình cần đọc giáo trình gốc không? | 🟡 |
| OQ-4 | Bổ sung liên kết buổi học trực tuyến cho lớp Online vào đâu? | 🟡 |
| OQ-5 | Nghiệp vụ học viên chủ động (nghỉ buổi, rời lớp) có trong lộ trình không? | 🟡 |
| OQ-6 | Nhắn giáo viên cần kênh trong app không? | 🟡 |
| OQ-7 | Buổi tới có cần loại buổi nghỉ lễ không? | 🟡 |
| OQ-8 | Chốt bộ chỉ số thành công cổng học viên. | 🟡 |
