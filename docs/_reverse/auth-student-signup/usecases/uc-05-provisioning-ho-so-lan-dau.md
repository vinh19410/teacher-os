# UC-05 — Tự động tạo hồ sơ học viên lần đầu vào portal (provisioning)

- **ID:** UC-05 · **Feature:** auth-student-signup · **Actor chính:** Hệ thống (kích hoạt bởi học viên)
- **a. Mô tả:** Lần đầu gọi API portal, nếu email chưa có hồ sơ và không có lời mời pending, hệ thống tự tạo hồ sơ học viên trong org sớm nhất toàn cục; lỗi chỉ ghi log, không chặn. ✅ [S5][S19][S21]
- **b. Actors phụ:** Không (toàn bộ phía server + DB).
- **c. Tiền điều kiện:** Session role=student, emailVerified=true.
- **d. Luồng chính:**
  1. UI gọi GET /api/student/me (apps/server/src/routes/student.ts:124-210).
  2. Guard kiểm tra role (500-512) và emailVerified (529-536).
  3. Tìm hồ sơ theo `lower(trim(email)) = email phiên` (student-provisioning.ts:27-35).
  4. Không thấy → kiểm tra lời mời pending (37-51); không có → chọn org sớm nhất toàn cục `createdAt ASC, id ASC limit 1` (53-64).
  5. Tạo hồ sơ: tên từ tài khoản, phone/zalo/parentName/parentPhone rỗng (67-76).
  6. Đọc lại hồ sơ (requery 148-164) và trả về cho UI.
  7. UI mở wizard onboarding nếu onboardingCompletedAt trống (→ UC-06).
- **e. Luồng thay thế:**
  - 3a. Đã có đúng 1 hồ sơ → dùng luôn, không tạo.
  - 3b. Nhiều hồ sơ trùng email → 403 STUDENT_AMBIGUOUS, màn "Thông tin tài khoản chưa rõ ràng" (E-19).
  - 4a. Có lời mời pending → bỏ tự tạo; portal báo "Tài khoản chưa được liên kết" kèm hướng dẫn chuông thông báo (E-17).
  - 4b. Không có org nào trong hệ thống → bỏ tạo im lặng (không log — log chỉ cho exception), portal trả NOT_LINKED.
  - 5a. Lỗi CSDL → chỉ console.error (fail-open, 77-83); portal vẫn trả kết quả không có hồ sơ 🟡 (hồ sơ có được tạo lại lần gọi sau — chưa thấy cơ chế thử lại).
  - 2a. Nhiều org và học viên muốn org khác → dùng header x-student-org-id hoặc ?org= (177-208), GET /orgs (676-713).
- **f. Hậu điều kiện:** Học viên có hồ sơ trong org; unique (org, lower(trim(email))) đảm bảo không trùng.
- **g. BR liên quan:** BR-005..012 (danh tính email, unique, org sớm nhất, fail-open, trường rỗng).
- **h. Nguồn:** S3, S5, S7, S19, S21; E2E apps/e2e/specs/student-portal-provisioning.spec.ts:11-36.
