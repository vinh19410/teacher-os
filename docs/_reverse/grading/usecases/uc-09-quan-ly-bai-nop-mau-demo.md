---
type: reverse-usecase
feature: grading
uc: UC-09
status: draft
updated: 2026-11-12
---

# UC-09 — Quản lý bài nộp mẫu demo

**a. Mục tiêu** — Tổ chức chưa có dữ liệu thật vẫn dùng thử trọn màn chấm qua một bài nộp mẫu, không ảnh hưởng học viên thật, ví Credit hay thông báo.

**b. Actor** — Chính: teacher/owner/admin/class_teacher (`canPublishGrade`).

**c. Điều kiện tiên quyết** — Người dùng đủ vai publish.

**d. Luồng chính** —
1. GV bấm "Tạo bài nộp mẫu dùng thử" trên hàng chờ [FR-10] (F10).
2. Hệ thống sinh bài nộp ID tiền tố "demo-attempt:" [FR-76].
3. Điểm mẫu cố định: task 6.5, coherence 6.5, lexical 6.0, grammar 6.0 [FR-74].
4. Trả 201; dòng bài mẫu vào hàng chờ [FR-74].
5. GV chấm/chốt thử như bài thật; publish demo KHÔNG gửi thông báo, KHÔNG đụng ví [FR-31].
6. Xoá khi không cần bằng DELETE theo tổ chức [FR-75].

**e. Luồng thay thế & lỗi** —
- E1: thiếu vai → chặn (cùng gate publish).
- E2: xoá bài mẫu rồi chấm tiếp → 404 "attempt not found" theo luồng thường.

**f. Hậu điều kiện** — Không notification, không credit log với attempt demo.

**g. Quy tắc nghiệp vụ** — BR-09 (thông báo bỏ demo); tiền tố demo là "hợp đồng" nhận diện giữa các luồng [FR-76].

**h. Truy vết** — FR-10, FR-31, FR-74…FR-76; BR-09; F10; Test: grading.test.ts:2586-2688 (demo-sample), apps/web/src/routes/_auth/grading/index.tsx:335-379.
