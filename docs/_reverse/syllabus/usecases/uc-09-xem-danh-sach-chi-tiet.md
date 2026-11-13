# UC-09 — Xem danh sách và chi tiết giáo trình

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-09 |
| Tên | Duyệt danh sách template, lọc theo kỹ năng, mở chi tiết |
| Mục tiêu | GV tìm và rà soát giáo trình, biết template nào đang được dùng bởi lớp nào |
| Mức | Summary (đọc) |
| Kích hoạt | Mở `/syllabus` |
| Nguồn chính | apps/web/src/routes/_auth/syllabus/index.tsx; apps/web/src/routes/_auth/syllabus/$syllabusId.tsx; apps/web/src/lib/repos/syllabus.ts |

## b. Actors

- **Chính:** Giáo viên — ✅

## c. Điều kiện tiên quyết

- Đã đăng nhập; snapshot đã load (web chờ snapshot đầu tiên — PDR dòng 17).

## d. Luồng chính

1. Trang đọc `useTemplates()` — chỉ template (`classId === null`), phân loại DỤ NHẤT qua `splitSyllabi`. ✅ [S11:21-31][S10:92-116]
2. PageHead kicker: "{n} template · {tổng buổi} buổi tổng cộng" (tổng buổi recompute từ cây). ✅ [S7:45][S10:43-46, 64]
3. Danh sách card: tag kỹ năng (hoặc nhãn loại lớp khi không có kỹ năng), trình độ, số buổi, tên, mô tả, số module, badge "Đang dùng N lớp" (đếm theo provenance `sourceTemplateId`), nút Xóa. ✅ [S7:99-135][S10:106-114]
4. Lọc chip: Tất cả / Viết / Nói / Đọc / Nghe — map tiếng Việt sang skill wire (Writing/Speaking/Reading/Listening); lọc không khớp → "Không có giáo trình nào phù hợp với bộ lọc."; danh sách rỗng → empty state hướng dẫn tạo/import. ✅ [S7:19-25, 34-40, 54-71]
5. Bấm card (hoặc Enter/Space) → navigate `/syllabus/$syllabusId`. ✅ [S7:81-97]
6. Chi tiết: nếu id không phải template (copy hoặc lạ) → not-found branded "Không tìm thấy syllabus" + link về danh sách. ✅ [S8:44-73]
7. Chi tiết hiển thị: tag kỹ năng/trình độ, mô tả + "Đang dùng N lớp", StatCard tổng buổi + module, cây module (thu gọn được) với buổi + badge Loại + materials + badge đếm tài liệu + mục tiêu, danh sách "Lớp đang dùng template này" (Lớp, Sĩ số, Tiến độ, Trạng thái) — bấm lớp điều hướng sang lớp. ✅ [S8:146-390]

## e. Luồng thay thế

- **A1 — Kind lạ trong snapshot:** normalize về "lesson", không crash; status lạ → style upcoming. ✅ [S10:25-32, 76-79][S21:14-16]
- **A2 — Objectives/materials rỗng:** hiển thị "—" placeholder. ✅ [S10:74-75]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| Mở id của copy như template | not-found branded (client) + 404 branded e2e | apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:46-72; apps/e2e/specs/syllabus-class-curriculum.spec.ts:376 | ✅ |
| Snapshot chưa có dữ liệu | empty state (không seed ảo) | apps/web/src/lib/repos/syllabus.test.ts:188 | ✅ |

## g. Hậu điều kiện

- Không thay đổi dữ liệu (flow chỉ đọc).

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-002, BR-019. ✅
- Test: apps/web/src/routes/_auth/syllabus/index.test.tsx:63 (chỉ template, không copy), :70 (đếm theo provenance), :160 (tiêu đề + chip lọc VN); apps/web/src/routes/_auth/syllabus/$syllabusId.test.tsx:82 (danh sách lớp dùng copy), :130 (chọn kind khi thêm bài); apps/web/src/lib/repos/syllabus.test.ts:76-190. ✅
