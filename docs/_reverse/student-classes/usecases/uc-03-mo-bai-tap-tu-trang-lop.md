---
type: reverse-usecase
feature: student-classes
uc: UC-03
status: draft
updated: "2026-11-12"
---

# UC-03 — Mở bài tập từ trang lớp

## a) Định danh

- **ID:** UC-03 · **Tên:** Xem và mở bài tập từ trang lớp · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `student-classes` (kết thúc tại ranh giới `student-quiz`) · **Trạng thái:** draft (tái lập)
- **Actor chính:** Học viên đã kích hoạt của lớp. ✅ [S2 — apps/server/src/routes/student.ts:1048-1063]
- **Nguồn chính:** S1, S11, S13, S16

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Học viên | Thấy đúng bài của lớp này, biết bài nào cần làm, mở được bài | ✅ |
| Giáo viên | Bài đã tới hạn mới hiện; nhãn trạng thái phản ánh đúng nộp/chấm | ✅ |
| Feature student-quiz | Nhận điểm chuyển màn hình từ trang lớp | ✅ |

## c) Điều kiện tiên quyết

- Trang chi tiết lớp đã mở (UC-01 luồng chính). ✅ [S11 — apps/student/src/components/class/class-detail-view.tsx:50-55]
- Bài tập có mục tiêu theo chính học viên này và đã tới hạn. ✅ [S1 — apps/server/src/routes/student-class.ts:145-207; S16 — apps/server/src/lib/assignment-visibility.ts:8-16]

## d) Điều kiện hậu

- **Thành công:** bảng bài tập hiển thị đủ bài tới hạn của lớp với nhãn trạng thái; bài có đường mở chuyển sang màn làm bài. Không có ghi gì xuống dữ liệu từ trang lớp. ✅ [S11 — apps/student/src/components/class/class-assignment-table.tsx:44-115; S13 — apps/student/src/lib/repos/student.ts:396-402]
- **Thất bại:** lớp không có bài → khối trống; bài ngoài lớp → chỉ xem, không liên kết. ✅ [S11 — apps/student/src/components/class/class-assignment-table.tsx:31-39, :99-115]

## e) Luồng chính

1. Khi mở chi tiết lớp, server lọc bài tập theo mục tiêu của học viên và bộ lọc tới hạn (không ngày mở, hoặc ngày mở <= bây giờ), chỉ riêng lớp này. ✅ [S1 — apps/server/src/routes/student-class.ts:145-207; S16 — apps/server/src/lib/assignment-visibility.ts:8-16]
2. Server nối bản ghi làm bài của học viên: điểm 4 tiêu chí, thời điểm chốt trả bài, trạng thái lần làm, thời điểm nộp. ✅ [S1 — apps/server/src/routes/student-class.ts:145-233 (:213-215 safeParse điểm)]
3. Client đếm bài chưa làm để dựng banner "Bạn còn {todo.length} bài chưa làm trong {className}" + nút "Làm ngay" khi n > 0. ✅ [S11 — apps/student/src/components/class/class-detail-view.tsx:107-162]
4. Tab "Bài tập" render 4 cột: tên bài, hạn, nhãn trạng thái, thao tác. ✅ [S11 — apps/student/src/components/class/class-assignment-table.tsx:22-58]
5. Client suy nhãn trạng thái từng bài: "Đã chấm · Nộp trễ" / "Đã chấm" / "Quá hạn" / "Sắp đến hạn" / "Chưa nộp". ✅ [S13 — apps/student/src/lib/assignment-status.ts:119-256]
6. Cột thao tác hiện "Nhận xét" / "Xem lại" / "Làm ngay" tùy tình trạng bài. ✅ [S11 — apps/student/src/components/class/class-assignment-table.tsx:61-68]
7. Học viên bấm thao tác có liên kết → chuyển sang màn làm bài/xem lại (ranh giới student-quiz). ✅ [S8 — apps/e2e/specs/student-class-detail.spec.ts:169-175]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Lớp chưa có bài tới hạn:** khối trống "Chưa có bài tập nào" / "Giáo viên chưa giao bài tập nào cho bạn."; không có banner. ✅ [S11 — apps/student/src/components/class/class-assignment-table.tsx:31-39]
- **A2 — Bài gán ngoài lớp (chỉ xem):** liên kết mở KHÔNG tạo cho bài không thuộc lớp này. ✅ [S11 — apps/student/src/components/class/class-assignment-table.tsx:99-115]
- **A3 — Điểm sai hình dạng:** safeParse thất bại → điểm rỗng, bài vẫn hiện với nhãn trạng thái bình thường. ✅ [S1 — apps/server/src/routes/student-class.ts:213-215]
- **A4 — Bài chờ giáo viên chấm (Speaking/đề chưa chốt):** nhãn phản ánh trạng thái chờ thay vì "Đã chấm". ✅ [S1 — apps/server/src/routes/student-class.ts:161-167 bình luận TOS-30 #478]
- **A5 — Banner hiện nhưng học viên chưa muốn làm ngay:** banner chỉ điều hướng, không ép; tab vẫn xem được. ✅ [S11 — apps/student/src/components/class/class-detail-view.tsx:107-162]

## g) Yêu cầu đặc biệt

- Bộ lọc tới hạn dùng chung một nguồn (BR-sc-007) ✅; một nguồn giờ VN cho hạn chót (NFR-sc-005) ✅; danh sách nằm trong cache 60s của chi tiết lớp (NFR-sc-006) ✅ [S13 — apps/student/src/lib/repos/student.ts:396-402].

## h) Thông tin bổ sung

- **Tần suất:** không có nguồn trong repo (không suy đoán nhãn).
- **Traceability:** FR-sc-012, FR-sc-016; BR-sc-007; F4; ranh giới student-quiz (reverse-gaps.md §4).
- **OQ liên quan:** không có OQ riêng; GAP-sc-4 (liên kết buổi) và OQ-8 (chỉ số click "Làm ngay") gián tiếp.
- **Nguồn test:** apps/e2e/specs/student-class-detail.spec.ts:169-175 · apps/server/src/student.test.ts:793-838 (assignments chỉ của lớp này).
