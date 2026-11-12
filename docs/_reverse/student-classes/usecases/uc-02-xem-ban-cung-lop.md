---
type: reverse-usecase
feature: student-classes
uc: UC-02
status: draft
updated: "2026-11-12"
---

# UC-02 — Xem "Bạn cùng lớp"

## a) Định danh

- **ID:** UC-02 · **Tên:** Xem danh sách bạn cùng lớp · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `student-classes` · **Trạng thái:** draft (tái lập)
- **Actor chính:** Học viên đã kích hoạt của lớp. ✅ [S3 — apps/server/src/routes/student-classmates.ts:42-57]
- **Nguồn chính:** S3, S5, S9, S11, S14

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Học viên trong lớp | Biết lớp có ai, nhận diện mình trong danh sách | ✅ |
| Các học viên khác trong lớp | Không bị lộ email, band, học phí, điểm qua trang này | ✅ |
| Hệ thống | Roster khóa cứng 4 trường; mọi nhánh không đủ quyền đều 404 | ✅ |

## c) Điều kiện tiên quyết

- Đang ở trang chi tiết lớp đã mở thành công (UC-01 luồng chính). ✅ [S11 — apps/student/src/components/class/class-detail-view.tsx:50-55]
- Bản thân học viên có ghi danh đã kích hoạt trong lớp, đúng tổ chức đang chọn. ✅ [S3 — apps/server/src/routes/student-classmates.ts:42-57]

## d) Điều kiện hậu

- **Thành công:** lưới thẻ bạn học gồm tên + ký hiệu 2 chữ cái; thẻ của chính học viên gắn "(bạn)"; không có trường liên hệ hay học vụ nào khác. ✅ [S11 — apps/student/src/components/class/classmates-tab.tsx:6-25, :64-73; S5 — apps/server/src/routes/student-classmates.test.ts:174-204]
- **Thất bại:** khối lỗi/khối trống trong tab, không đổi dữ liệu. ✅ [S11 — apps/student/src/components/class/classmates-tab.tsx:43-62]

## e) Luồng chính

1. Học viên mở tab "Bạn cùng lớp" trong trang chi tiết. ✅ [S11 — apps/student/src/components/class/class-detail-view.tsx:50-55]
2. Client chỉ cho phép truy vấn chạy khi tab đang mở; dữ liệu cache 60 giây. ✅ [S13 — apps/student/src/lib/repos/student.ts:438-445]
3. Server chạy đúng guard như chi tiết lớp: ghi danh đã kích hoạt của chính học viên + đúng tổ chức; không qua → 404. ✅ [S3 — apps/server/src/routes/student-classmates.ts:42-57; S5 — apps/server/src/routes/student-classmates.test.ts:207-226]
4. Server truy vấn roster: mọi ghi danh đã kích hoạt của lớp trong tổ chức, lấy đúng 2 trường gốc (định danh, tên), sắp theo tên tăng dần rồi định danh. ✅ [S3 — apps/server/src/routes/student-classmates.ts:59-70]
5. Server suy ký hiệu 2 chữ cái (2 từ cuối tên; 1 từ → 1 chữ; rỗng → "?") và cờ "(bạn)" cho người xem. ✅ [S3 — apps/server/src/routes/student-classmates.ts:17-22, :72-78; S5 — apps/server/src/routes/student-classmates.test.ts:228-232]
6. Client nhận hợp đồng 4 trường đã khóa (định danh, tên, ký hiệu, cờ bạn) và render lưới thẻ. ✅ [S14 — packages/api/src/contracts.ts:2222-2232; S11 — apps/student/src/components/class/classmates-tab.tsx:64-73]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Học viên chờ kích hoạt mở roster:** 404 như lớp không tồn tại. ✅ [S5 — apps/server/src/routes/student-classmates.test.ts:207-211]
- **A2 — Người chờ kích hoạt trong danh sách:** không xuất hiện trong roster (chỉ đã kích hoạt được đếm). ✅ [S9 — apps/e2e/specs/student-classmates.spec.ts:132-133]
- **A3 — Lớp chỉ có mình:** roster vẫn trả 1 thẻ — chính học viên với "(bạn)"; nếu org/loại dữ liệu gây rỗng thì hiện khối trống "Lớp chưa có học viên nào". ✅ [S9 — apps/e2e/specs/student-classmates.spec.ts:124-130; S11 — apps/student/src/components/class/classmates-tab.tsx:54-62]
- **A4 — Lỗi bất định:** "Không tải được danh sách lớp" + "Vui lòng thử lại sau ít phút." ✅ [S11 — apps/student/src/components/class/classmates-tab.tsx:43-51; test apps/student/src/components/class/classmates-tab.test.tsx:65-74]
- **A5 — Chưa có email công khai trong dữ liệu:** hợp đồng không có trường email nên không thể lộ; E2E khẳng định không có ký tự "@" trong tab. ✅ [S14 — packages/api/src/contracts.ts:2222-2232; S9 — apps/e2e/specs/student-classmates.spec.ts:134-135]

## g) Yêu cầu đặc biệt

- Riêng tư khóa hợp đồng (NFR-sc-003, SC-sc-05) ✅; cô lập tổ chức (NFR-sc-001) ✅; gọi có điều kiện theo tab + cache (NFR-sc-006) ✅ [S13 — apps/student/src/lib/repos/student.ts:438-445].

## h) Thông tin bổ sung

- **Tần suất:** không có nguồn trong repo (không suy đoán nhãn).
- **Traceability:** FR-sc-014, FR-sc-015; BR-sc-003, BR-sc-010, BR-sc-013; E-sc-006, E-sc-009..011; F2.
- **OQ liên quan:** OQ-5 (nghiệp vụ học viên chủ động có mở rộng roster không).
- **Nguồn test:** apps/server/src/routes/student-classmates.test.ts:174-232 · apps/e2e/specs/student-classmates.spec.ts:106-136 · apps/student/src/components/class/classmates-tab.test.tsx:25-74.
