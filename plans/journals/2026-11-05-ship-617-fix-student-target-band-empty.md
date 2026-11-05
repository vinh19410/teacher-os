---
title: "Ship #617: Chuẩn hóa định dạng dòng mục tiêu học viên, khắc phục Band — ()"
date: 2026-11-05
summary: "Hoàn tất triển khai TDD sửa lỗi #617: tạo helper formatStudentTarget chuẩn hóa 4 trạng thái mục tiêu của học viên, hiển thị 'Chưa đặt mục tiêu' khi thiếu dữ liệu và bỏ ngoặc rỗng, unit test và route test đạt 100% pass, code review đạt 0 findings, sẵn sàng mở PR beta vào develop"
---

# Ship #617: Chuẩn hóa định dạng dòng mục tiêu học viên, khắc phục Band — ()

## Chuyện gì đã xảy ra

1. **Phân tích nguyên nhân gốc:**
   - Trang chi tiết học viên (`apps/web/src/routes/_auth/students/$studentId.tsx:177`) render trực tiếp chuỗi template:
     `Mục tiêu: Band {student.targetBand} ({student.skills.join(", ")})`.
   - Trong `apps/web/src/lib/repos/students.ts:70-71`, mọi học viên từ DB/kernel snapshot đều được gán mặc định `targetBand: "—"` và `skills: []`.
   - Khi mở trang chi tiết của học viên chưa có mục tiêu, dòng hiển thị biến thành chuỗi bất thường `Mục tiêu: Band — ()`.

2. **Triển khai TDD Red → Green:**
   - **Phase 1 (Format Helper TDD):**
     - Viết 14 test cases trong `apps/web/src/lib/format-student-target.test.ts` kiểm thử toàn bộ 4 trạng thái:
       1. Band + Skills: `Mục tiêu: Band 6.5 (Writing, Speaking)`.
       2. Band only: `Mục tiêu: Band 6.5` (bỏ ngoặc rỗng).
       3. Skills only: `Mục tiêu: Writing, Speaking`.
       4. Fallback: `Chưa đặt mục tiêu` (khi band là `"—"`, `""`, whitespace, `null`, `undefined` và skills rỗng).
     - Bổ sung phòng thủ cho numeric band (`targetBand: 6.5`), lọc bỏ non-string primitives trong `skills`, và trim khoảng trắng.
     - Tạo hàm thuần `formatStudentTarget` trong `apps/web/src/lib/format-student-target.ts`.
   - **Phase 2 (Route Integration):**
     - Thêm test case trong `apps/web/src/routes/_auth/students/$studentId.test.tsx` assert xuất hiện `"Chưa đặt mục tiêu"`, không có `"Band —"` và không có `"()"`.
     - Thay thế chuỗi render cứng tại `$studentId.tsx` bằng `{formatStudentTarget(student)}`.
   - **Phase 3 (Verify & Quality):**
     - Chạy toàn bộ 184 test files (1889 tests) của `apps/web`: pass 100%.
     - `pnpm check-types`: 12/12 packages pass sạch.
     - `pnpm exec biome check .`: 0 errors.

3. **Tham vấn Kongming & Code Review:**
   - Hoàn tất 3 vòng tham vấn Kongming (`--advice`): điều tra ban đầu, duyệt plan gates & Failure Protocol, và sau khi hoàn tất code review.
   - Code Review (`PendingCodeReview`) đạt 0 Critical / 0 High / 0 Unresolved findings sau khi áp dụng defensive typing cho skills và band.

## Quyết định

- Hiển thị `"Chưa đặt mục tiêu"` khi thiếu dữ liệu để đồng bộ với các mục khác trong kicker (`"Chưa có SĐT"`, `"Chưa có email"`).
- Không sửa mặc định `targetBand: "—"` trong `repos/students.ts` để tránh ảnh hưởng domino sang các màn hình khác.
- Ghi nhận `class-roster-tab.tsx:143` (hiển thị `"Band —"` trong bảng danh sách lớp) là follow-up riêng.

## Bước tiếp theo

- Mở PR vào `develop` qua `ak-ship beta`.
- Gắn nhãn `ready to ship beta` và review PR qua `ak-review-pr`.
- Merge PR và theo dõi CI `develop`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
