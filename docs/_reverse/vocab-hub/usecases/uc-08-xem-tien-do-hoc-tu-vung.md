---
feature: vocab-hub
type: reverse-usecase
uc: UC-08
status: draft
updated: "2026-11-12"
---

# UC-08 — Xem tiến độ học từ vựng của học viên

## a. Tên use case

Xem tiến độ học từ vựng của học viên.

## b. Mã UC / phạm vi

UC-08 — feature vocab-hub; phạm vi: đọc-tổng-hợp phía giáo viên. Dữ liệu được
tạo bởi hành vi học của học viên (student-practice) — chỉ nháy chéo.

## c. Tác nhân

Giáo viên (đối tượng: học viên cùng tổ chức).

## d. Luồng chính (truy vết FR)

1. Giáo viên mở tab "Tiến độ" trên /vocab. ✅ FR-21 (index.tsx:29-36).
2. Bộ lọc học viên (theo tên/SĐT/email) → chọn 1 học viên. ✅ FR-21
   (vocab-progress-tab.tsx:129-138).
3. Tab gọi endpoint tiến độ riêng (không qua bản chụp) và phân tích phản hồi
   bằng hợp đồng. ✅ FR-20, FR-21, NFR-05 (progress-tab.tsx:156-186;
   contracts.ts:3422-3466).
4. Máy chủ xác thực học viên cùng tổ chức, tính "hôm nay" theo +07:00, gom
   bộ từ tiếp cận từ 3 nguồn: lớp đang ghi danh hiệu lực ∪ gợi ý đã được chấp
   nhận ∪ khóa thư viện mà học viên đã có thẻ; trùng bộ ưu tiên lớp > gợi ý >
   thư viện. ✅ FR-20, BR-12 (vocab-teacher.ts:498-527;
   vocab-provision.ts:72-247).
5. Với từng bộ: tổng số từ, phân bố 5 cấp độ (chỉ thẻ đang review), số đến
   hạn trước cuối ngày +07:00, số chưa học, số đã ôn, học gần nhất; kèm hoạt
   động 7 ngày (hôm nay − 6) gồm cả ngày 0 lượt. ✅ FR-20
   (vocab-teacher.ts:569-651).
6. UI hiển thị mỗi bộ 1 khối: huy hiệu nguồn ("Lớp {tên}"/"Lớp học"; "Khóa
   {tên}"/"Thư viện"; "Gợi ý"), dòng "Đang học {x}/{tổng} từ · Chưa học {n}
   từ" (+ "· Học gần nhất {ngày}"), "Đến hạn hôm nay: {n}", dải "Cấp 1".."Cấp
   5"; phần tổng có 3 chỉ số, "Hoạt động 7 ngày (giờ Việt Nam)", "Bộ từ vựng
   của học viên". ✅ FR-21 (vocab-progress-tab.tsx:33-108,284-390).

## e. Luồng thay thế (mã lỗi)

- 2a. Tổ chức không có học viên → "Chưa có học viên nào trong trung tâm để
  theo dõi tiến độ." ✅ E-31 (vocab-progress-tab.tsx:217).
- 3a. Thiếu studentId → 400. ✅ E-11 (vocab-teacher.ts:501-504).
- 3b. Học viên lạ/khác tổ chức → 404. ✅ E-10 (vocab-teacher.ts:507-514).
- 3c. Chưa đăng nhập → 401. ✅ E-01.
- 4a. Học viên chưa có bộ từ nào → "Học viên chưa có bộ từ vựng nào (chưa
  vào lớp có bộ từ hoặc chưa nhận gợi ý)." ✅ E-31
  (vocab-progress-tab.tsx:364-371).
- 3d. Tải lỗi → nút thử lại. ✅ FR-21 (progress-tab.tsx:188-221).

## f. Hậu điều kiện

- Không có thay đổi dữ liệu (chỉ đọc tổng hợp). Người dùng hiểu được trạng
  thái SRS hiện tại của từng học viên theo giờ Việt Nam.

## g. Quy tắc liên quan

BR-12 (múi giờ Việt Nam + cửa sổ 7 ngày), BR-13 (server chỉ đọc tổng hợp,
không tạo thẻ), BR-01 (sở hữu tổ chức).

## h. Truy vết

FR-20, FR-21; E-01, E-10, E-11, E-31; F6; SM-07; INF-4;
Nguồn: vocab-progress-tab.tsx:33-390; vocab-teacher.ts:498-652;
vocab-provision.ts:72-247; contracts.ts:3422-3466;
vocab-teacher.test.ts:453,708.
