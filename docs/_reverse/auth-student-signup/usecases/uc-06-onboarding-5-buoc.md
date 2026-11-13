# UC-06 — Hoàn thành onboarding 5 bước

- **ID:** UC-06 · **Feature:** auth-student-signup · **Actor chính:** Học viên
- **a. Mô tả:** Học viên khai mục tiêu học tập qua wizard 5 bước: kỳ thi quan tâm (ielts/toeic), trình độ hiện tại, điểm mục tiêu, mục tiêu học (>= 1, không trùng), giờ tự học mỗi ngày; kèm ghi chú và điểm đầu vào tùy chọn. ✅ [S11][S22]
- **b. Actors phụ:** Không.
- **c. Tiền điều kiện:** Đã có hồ sơ học viên (UC-05 xong), onboardingCompletedAt trống.
- **d. Luồng chính:**
  1. Portal mở wizard thay cho nội dung chính.
  2. Chọn kỳ thi → bộ điểm mục tiêu đổi theo exam (superRefine: targetScore phải thuộc IELTS_TARGET_BANDS hoặc TOEIC_TARGET_SCORES — packages/api/src/contracts.ts:2058-2073).
  3. Chọn trình độ hiện tại, điểm mục tiêu, >= 1 mục tiêu học (không trùng), giờ tự học (contracts.ts:2049-2075).
  4. Nhập ghi chú (<= 200 ký tự) và điểm đầu vào (<= 50 ký tự) — tùy chọn.
  5. Submit → POST /api/student/onboarding (apps/server/src/routes/student.ts:1241-1290).
  6. Server lưu và đóng dấu onboardingCompletedAt; toast "Thiết lập mục tiêu thành công!" (onboarding-wizard.tsx:123).
- **e. Luồng thay thế:**
  - 2a. Thiếu trường bắt buộc → toast "Vui lòng điền đầy đủ các thông tin bắt buộc." (onboarding-wizard.tsx:107 — E-27).
  - 5a. API lỗi → toast "Không thể lưu thông tin. Vui lòng thử lại." (E-28).
  - 5b. targetScore ngoài bộ điểm của exam → chặn bởi superRefine ("targetScore must be one of …").
  - 1a. Học viên bỏ dở → lần sau vào portal lại thấy wizard (trạng thái chưa onboarding giữ nguyên).
- **f. Hậu điều kiện:** onboardingCompletedAt có giá trị; lần sau vào thẳng tổng quan.
- **g. BR liên quan:** BR-016 (gate nội dung theo onboarding).
- **h. Nguồn:** S8 (contracts.ts:2000-2075), S11, S22 (E2E student-portal-onboarding.spec.ts:309+, 464+).
