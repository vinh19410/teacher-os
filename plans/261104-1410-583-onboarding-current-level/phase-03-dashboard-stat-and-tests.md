# Phase 3: Dashboard Stat Card và Unit Tests

## Goal
Hiển thị ô StatCard "Trình độ hiện tại" trên Dashboard học viên, cập nhật test suites server/student, cập nhật E2E specs tương ứng với wizard 5 bước, và ghi nhận changelog.

## Target files and symbols
- `apps/student/src/routes/_auth/index.tsx`:
  - Thêm StatCard cho `currentLevel` (đặt trước Band mục tiêu)
- `apps/server/src/student.test.ts`:
  - Cập nhật các payload mẫu trong test suite với trường `currentLevel`
  - Thêm test case xác thực `currentLevel` (thiếu/không hợp lệ -> 400, hợp lệ -> 200, round-trip `/me`, null-resilience, idempotent overwrite)
- `apps/student/test/onboarding.test.tsx`:
  - Cập nhật test `OnboardingSummary` và test wizard flow 5 bước
- `apps/e2e/specs/student-portal-onboarding.spec.ts` & `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`:
  - Thêm bước chọn trình độ hiện tại vào luồng e2e wizard
  - Assert DB cột `current_level`
- `CHANGELOG.md`:
  - Thêm dòng ghi chú tính năng mới theo conventional commit

## Tasks & Steps

### Task 3.1 — Thêm StatCard Trình độ hiện tại trên Dashboard
- Goal: Hiển thị trình độ hiện tại của học viên trên màn hình tổng quan Home/Dashboard.
- Target files: `apps/student/src/routes/_auth/index.tsx`
- Steps:
  1. Import `getCurrentLevelLabel` từ `@/components/onboarding/onboarding-steps`.
  2. Tại dải stat card (dòng ~113), thêm StatCard có điều kiện:
     ```tsx
     {me.student.currentLevel && me.student.currentLevel !== "unsure" ? (
       <StatCard
         label="Trình độ hiện tại"
         value={getCurrentLevelLabel(me.student.currentLevel, me.student.examInterest)}
         sub={
           me.student.examInterest === "toeic"
             ? "Điểm TOEIC tự đánh giá"
             : "Band IELTS tự đánh giá"
         }
       />
     ) : null}
     ```
  3. Đặt StatCard này ngay trước `me.student.targetScore` để đảm bảo thứ tự đọc tự nhiên: "Trình độ hiện tại" -> "Band mục tiêu".
- Success criteria: Không lỗi typecheck, giao diện render an toàn khi `currentLevel` null hoặc "unsure".
- Verify: `pnpm --filter student check-types` exits 0.

### Task 3.2 — Cập nhật và bổ sung unit tests cho apps/server
- Goal: Đảm bảo kiểm chứng cơ học toàn diện cho endpoint `/api/student/onboarding` và `/api/student/me`.
- Target files: `apps/server/src/student.test.ts`
- Steps:
  1. Cập nhật các payload onboarding cố định trong test suite để có `currentLevel: "intermediate"` (hoặc giá trị hợp lệ).
  2. Cập nhật `buildStudentMe` test fixture ở dòng ~318 với `currentLevel: null`.
  3. Bổ sung test case kiểm tra payload thiếu `currentLevel` trả về 400 `invalid body`.
  4. Bổ sung test case kiểm tra `currentLevel` không hợp lệ (ví dụ `"expert"`) trả về 400 `invalid body`.
  5. Bổ sung test case kiểm tra `currentLevel: "unsure"` vẫn lưu thành công giá trị `"unsure"` vào DB.
  6. Xác nhận `GET /api/student/me` trả về đúng trường `currentLevel` sau khi lưu.
  7. Xác nhận dữ liệu bị hỏng trong DB vẫn fail-soft thành `null` chứ không làm sập ứng dụng.
- Success criteria: Mọi test trong `apps/server/src/student.test.ts` đều vượt qua.
- Verify: `pnpm --filter server test -- student.test.ts` exits 0.

### Task 3.3 — Cập nhật và bổ sung unit tests cho apps/student
- Goal: Đảm bảo component onboarding và summary render đúng với 5 bước.
- Target files: `apps/student/test/onboarding.test.tsx`
- Steps:
  1. Cập nhật test `OnboardingSummary` kiểm tra hiển thị dòng "Trình độ hiện tại".
  2. Thêm test cho component `CurrentLevelStep` kiểm tra render các option theo `examInterest`.
  3. Kiểm tra flow wizard 5 bước hoạt động đúng từ chọn kỳ thi đến summary.
- Success criteria: Toàn bộ test trong `apps/student/test/onboarding.test.tsx` đều vượt qua.
- Verify: `pnpm --filter student test -- onboarding.test.tsx` exits 0.

### Task 3.4 — Cập nhật E2E specs với bước onboarding mới
- Goal: Tránh gãy e2e do wizard chuyển từ 4 lên 5 bước và xác thực cột DB `current_level`.
- Target files:
  - `apps/e2e/specs/student-portal-onboarding.spec.ts`
  - `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`
- Steps:
  1. Trong `student-portal-onboarding.spec.ts`:
     - Chèn bước chọn trình độ (ví dụ nút "4.5 – 5.5" hoặc "Mới bắt đầu") kèm kiểm tra contrast / selection distinction và bấm "Tiếp tục" trước bước "Band 6.5".
     - Trong đoạn SELECT DB ở cuối test, thêm `current_level` vào câu truy vấn và assert `expect(row?.current_level).toBe("intermediate")` (hoặc level đã chọn).
  2. Trong `student-org-invitation-and-switcher.spec.ts`:
     - Chèn bước chọn trình độ giữa bước chọn IELTS và Band 6.5.
- Success criteria: Code spec đồng bộ với giao diện mới.
- Verify: `pnpm --filter e2e check-types` exits 0.

### Task 3.5 — Cập nhật CHANGELOG.md và Code Gates tổng thể
- Goal: Ghi nhận changelog và đảm bảo toàn bộ repo pass mọi gates.
- Target files: `CHANGELOG.md`
- Steps:
  1. Thêm một mục vào `CHANGELOG.md`:
     `feat(student): hỏi trình độ hiện tại trong onboarding wizard (#583)`
  2. Chạy `pnpm check` (biome formatting và linting).
  3. Chạy `pnpm check-types` trên toàn monorepo.
  4. Chạy unit tests của server và student.
- Success criteria: Tất cả các lệnh kết thúc với exit code 0.
- Verify: `pnpm check-types` exits 0 và `pnpm check` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
