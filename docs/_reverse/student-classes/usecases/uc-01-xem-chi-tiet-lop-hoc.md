---
type: reverse-usecase
feature: student-classes
uc: UC-01
status: draft
updated: "2026-11-12"
---

# UC-01 — Xem chi tiết lớp học

## a) Định danh

- **ID:** UC-01 · **Tên:** Xem chi tiết lớp học · **Mức:** mục tiêu cấp người dùng (summary) · **Scope:** feature `student-classes` · **Trạng thái:** draft (tái lập)
- **Actor chính:** Học viên đã kích hoạt (ghi danh `active` trong tổ chức đang chọn). ✅ [S2 — apps/server/src/routes/student.ts:1048-1063]
- **Nguồn chính:** S2, S10, S11, S6, S8 (kèm S1 cho Buổi tới/sắp buổi, S3 cho hạ tầng guard)

## b) Actor & bên liên quan

| Bên | Quan tâm | Nhãn |
|-----|----------|------|
| Học viên đã kích hoạt | Xem đúng lớp của mình: giáo viên, lịch buổi, Buổi tới, tiến độ kho | ✅ |
| Học viên chờ kích hoạt | Không vào được nội dung lớp trước khi tham gia; không bị lộ thông tin lớp | ✅ |
| Giáo viên | Thông tin liên hệ của mình hiện đúng để học viên nhắn; không thể truy cập cổng học viên | ✅ |
| Hệ thống | Không lộ sự tồn tại của lớp với người ngoài lớp (404 đồng nhất) | 🔵 |

## c) Điều kiện tiên quyết

- Học viên có phiên hợp lệ và hồ sơ học viên hợp lệ (không phải giáo viên, đã liên kết, email đã xác thực). ✅ [S2 — apps/server/src/routes/student.ts:500-545]
- Có ghi danh đã kích hoạt của chính học viên trong lớp, đúng tổ chức đang chọn. ✅ [S2 — apps/server/src/routes/student.ts:1048-1063]

## d) Điều kiện hậu

- **Thành công:** học viên thấy thẻ thông tin lớp (giáo viên, thời lượng, khung giờ, Buổi tới), vòng tiến độ 4 ô, banner việc cần làm (nếu có bài chưa làm) và 4 tab nội dung. KHÔNG có dữ liệu nào bị thay đổi (feature chỉ đọc). ✅ [S11 — apps/student/src/components/class/class-detail-view.tsx:230-363; S13 — apps/student/src/lib/repos/student.ts:396-402]
- **Thất bại:** một trong các màn từ chối (không tìm thấy / lỗi cổng / onboarding), không có dữ liệu lớp nào hiển thị, không có ghi gì xuống dữ liệu. ✅ [S11 — apps/student/src/components/class/class-detail-view.tsx:365-379]

## e) Luồng chính

1. Học viên ở trang danh sách lớp thấy card các lớp đã tham gia; card đã kích hoạt là một liên kết tràn card. ✅ [S12 — apps/student/src/components/overview/class-card.tsx:55-68]
2. Học viên bấm card lớp; SPA chuyển tới trang chi tiết. ✅ [S10 — apps/student/src/routes/_auth/classes/$classId.tsx:14-23]
3. Chuỗi chắn phiên kiểm tra đăng nhập; chưa đăng nhập thì về trang đăng nhập. ✅ [S10 — apps/student/src/routes/_auth/route.tsx:4-13]
4. API học viên chặn vai trò giáo viên và tự nối hồ sơ nếu lần đầu; thất bại hồ sơ trả mã lỗi tương ứng. ✅ [S2 — apps/server/src/routes/student.ts:506-516, :148-199; S7 — apps/server/src/role-gates.test.ts:190-217]
5. Server tra ghi danh ĐÃ KÍCH HOẠT của học viên trong tổ chức đang chọn; không thấy → 404. ✅ [S2 — apps/server/src/routes/student.ts:1048-1063; S6 — apps/server/src/student.test.ts:840-856]
6. Server dựng payload: thông tin lớp + ngày khai giảng, chuỗi buổi theo ghi danh (sắp thứ tự, lớp legacy xen kẽ slot), giáo viên tổ chức, Buổi tới, danh sách bài tập tới hạn của lớp. ✅ [S2 — apps/server/src/routes/student.ts:1069-1106; S1 — apps/server/src/routes/student-class.ts:77-139, :236-278]
7. Client kiểm định hình dạng dữ liệu; lệch hình dạng → trang lỗi chung. ✅ [S13 — apps/student/src/lib/repos/student.ts:187-218]
8. Trang render: đầu trang (tên lớp + trạng thái + "Nhắn giáo viên"), thẻ thông tin, vòng tiến độ (nghỉ lễ không trừ tổng), banner bài chưa làm, 4 tab. ✅ [S11 — apps/student/src/components/class/class-detail-view.tsx:230-363, :66-162]
9. Tab Hành trình học hiển thị dải buổi với nhãn trạng thái, huy hiệu "Buổi tới" (aria-current), tài liệu kèm (trừ nghỉ lễ/huỷ). ✅ [S11 — apps/student/src/components/class/class-lesson-list.tsx:108-215; S8 — apps/e2e/specs/student-class-detail.spec.ts:155-166]

## f) Luồng thay thế / nghiệp vụ ngoại lệ

- **A1 — Ghi danh chưa kích hoạt:** card không có liên kết, chỉ có nút "Tham gia lớp"; gọi API chi tiết trực tiếp vẫn 404, màn hình như lớp không tồn tại. ✅ [S12 — apps/student/src/components/overview/class-card.tsx:55-68; S6 — apps/server/src/student.test.ts:840-846; S8 — apps/e2e/specs/student-class-detail.spec.ts:209-217]
- **A2 — Lớp lạ / tổ chức khác:** cùng 404 như A1 (không phân biệt nguyên nhân). ✅ [S6 — apps/server/src/student.test.ts:848-856]
- **A3 — Đổi tổ chức giữa lúc trang mở:** trang rơi vào 404 như A2 (kịch bản code chủ đích ghi chú). ✅ [S10 — apps/student/src/routes/_auth/classes/$classId.tsx:51-53]
- **A4 — Giáo viên mở cổng:** 403 ACCOUNT_TEACHER_ROLE, màn lỗi riêng. ✅ [S7 — apps/server/src/role-gates.test.ts:190-217; S12 — apps/student/src/components/overview/student-error-view.tsx:99-104]
- **A5 — Chưa liên kết hồ sơ:** màn lỗi "Tài khoản chưa được liên kết"; chuyển hướng onboarding thuộc nhánh hồ sơ chưa hoàn tất onboarding (:42-44). ✅ [S10 — apps/student/src/routes/_auth/classes/$classId.tsx:29-44]
- **A6 — Dữ liệu lệch hình dạng:** trang lỗi chung "Không thể truy cập cổng học viên". ✅ [S13 — apps/student/src/lib/repos/student.ts:187-218; S12 — apps/student/src/components/overview/student-error-view.tsx:82-86]
- **A7 — Lớp legacy (buổi không ngày):** vẫn render; không có Buổi tới; buổi được sắp lại theo slot xen kẽ. ✅ [S1 — apps/server/src/routes/student-class.ts:77-82, :236-278; S6 — apps/server/src/student.test.ts:858-907]
- **A8 — Tổ chức không có giáo viên:** ô giáo viên rỗng với câu thay thế, nút "Nhắn giáo viên" không tạo. ✅ [S6 — apps/server/src/student.test.ts:783-791; S11 — apps/student/src/components/class/class-info-card.tsx:150-154, class-detail-view.tsx:273-281]

## g) Yêu cầu đặc biệt

- Cô lập tổ chức (NFR-sc-001) ✅; chắn vai trò (NFR-sc-002) ✅; một nguồn giờ VN (NFR-sc-005) ✅; cache 60s (NFR-sc-006) ✅; tiếp cận aria-current + bàn phím (NFR-sc-008) ✅ [S8 — apps/e2e/specs/student-class-detail.spec.ts:143-147, :320-324].

## h) Thông tin bổ sung

- **Tần suất:** không có nguồn trong repo về tần suất sử dụng (không suy đoán nhãn).
- **Traceability:** FR-sc-001..013, FR-sc-017, FR-sc-018; BR-sc-002..006, BR-sc-008..012, BR-sc-014; E-sc-001..008; SC-sc-01..06; F1, F3.
- **OQ liên quan:** OQ-1 (giáo viên tổ chức), OQ-2 (số liệu card kế thừa), OQ-3 (Giáo trình tự nhóm), OQ-4 (không có liên kết buổi trực tuyến), OQ-7 (Buổi tới đè lên nghỉ lễ).
- **Nguồn test:** apps/server/src/student.test.ts:767-914, :1487-1732 · apps/e2e/specs/student-class-detail.spec.ts:120-257, :320-324 · apps/server/src/role-gates.test.ts:190-235.
