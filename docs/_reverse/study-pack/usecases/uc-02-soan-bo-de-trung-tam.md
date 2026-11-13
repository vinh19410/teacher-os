---
feature: study-pack
type: reverse-usecase
uc: UC-02
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-02 — Soạn bộ đề của trung tâm

## Mô tả

Giáo viên tạo mới hoặc sửa một bộ đề thuộc trung tâm: tiêu đề, mô tả, trạng
thái, danh sách mục chia theo ngày, mỗi mục trỏ tới một đề đã có (đề trung tâm,
part thư viện hoặc bài tập hệ thống theo hợp đồng; màn hình hiện chỉ cho chọn
đề trung tâm).

## Actor

- Chính: Giáo viên (nhóm vai "chốt bài" để ghi).

## Tiền điều kiện

- Đã đăng nhập; (khi sửa) bộ đề thuộc trung tâm của người dùng.

## Hậu điều kiện

- Bộ đề và danh sách mục được ghi; bộ "Sẵn sàng" phải có ít nhất một mục.

## Luồng chính

1. Giáo viên nhập tiêu đề, mô tả, chọn trạng thái ("Sẵn sàng" mặc định /
   "Nháp"). ✅ apps/web/src/routes/_auth/assignments/packs.tsx:75, :538-541
2. Thêm mục theo "Ngày n": màn hình lọc đề trung tâm đã sẵn sàng, đúng 4 kỹ
   năng. ✅ apps/web/src/routes/_auth/assignments/packs.tsx:91-100
3. Màn hình kiểm tại chỗ: thiếu tiêu đề, trần ngày/mục, trùng mục trong một
   ngày → chặn trước khi gửi. ✅ apps/web/src/routes/_auth/assignments/packs.tsx:229-279
4. Gửi lưu; máy chủ kiểm vai ghi, kiểm JSON, đối chiếu hợp đồng (khép, trần
   366/10/200/ghi chú 2000, không trùng). ✅
   apps/server/src/routes/study-pack.ts:120-161; ✅
   packages/api/src/contracts.ts:4480-4482, :4491, :4508-4535
5. Máy chủ kiểm từng nguồn tới cùng org, đúng kỹ năng, đã sẵn sàng (ba lớp
   điều kiện). ✅ apps/server/src/lib/study-pack-clone.ts:354-630
6. Ghi bộ + mục trong một lô. ✅ apps/server/src/routes/study-pack.ts:139-157

## Luồng thay thế / lỗi

- Sai vai ghi → E-03; sai kiểu nội dung → E-04; JSON hỏng → E-05; không qua
  hợp đồng → E-06.
- Mã bộ không thấy/khác trung tâm → E-07 (khi sửa).
- Nguồn lạ hình → E-10; bộ hệ thống trỏ đề trung tâm → E-11 (kịch bản phía
  thư viện hệ thống); đề trung tâm không thấy → E-12; chưa sẵn sàng → E-13;
  kỹ năng ngoài danh sách → E-14; đề kèm Writing → E-15; part không thấy →
  E-16; part nghe → E-17; part kỹ năng lạ → E-18; part thuộc đề nháp → E-19;
  bài tập không thấy → E-20; bài tập chưa sẵn sàng → E-21.
- Ghi xong đọc lại không thấy → E-29 (500).
- Lỗi UI kiểm tại chỗ → E-32; lỗi mạng/server → E-34.

## Quy tắc nghiệp vụ liên quan

- BR-02 (chưa sẵn sàng không vào lộ trình), BR-03 (4 kỹ năng), BR-04 (đề kèm
  Writing bị chặn), BR-10 (sửa giữ mã mục theo khoá ngày+nguồn).

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-03, FR-04, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12 |
| NFR | NFR-01, NFR-02, NFR-03, NFR-07 |
| BR | BR-02, BR-03, BR-04, BR-10 |
| E | E-01, E-03..E-07, E-10..E-21, E-29, E-32, E-34 |
| Luồng | F2 |
| Câu hỏi mở | OQ-02 (ý nghĩa nháp), OQ-03 (căn cứ trần), OQ-04 (màn chỉ cho đề trung tâm), OQ-10 (sửa bộ đang gán) |

## Ghi chú

- Hợp đồng nhận cả part thư viện làm nguồn nhưng màn soạn chỉ lọc đề trung tâm
  — khoảng hẹp UI/hợp đồng (OQ-04). ✅
  packages/api/src/contracts.ts:4466-4471; ✅
  apps/web/src/routes/_auth/assignments/packs.tsx:91-100
