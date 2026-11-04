# Phase 2: Server Route và Onboarding Wizard UI

## Goal
Cập nhật server endpoint `/api/student/onboarding` và `/api/student/me` để đọc/ghi `currentLevel`, đồng thời nâng cấp giao diện `OnboardingWizard` từ 4 bước lên 5 bước kèm component `CurrentLevelStep`.

## Target files and symbols
- `apps/server/src/routes/student.ts`:
  - Hàm `buildStudentMe`: map `currentLevel` bằng `parseEnum(s.currentLevel ?? null, CURRENT_LEVEL_OPTIONS)`
  - Route `POST /api/student/onboarding`: trích xuất `currentLevel` từ `parsed.data` và `.set({ currentLevel })`
- `apps/student/src/components/onboarding/onboarding-steps.tsx`:
  - Thêm `CURRENT_LEVEL_LABELS` (IELTS & TOEIC)
  - Thêm hàm helper `getCurrentLevelLabel(level, examInterest)`
  - Component `CurrentLevelStep`
  - Cập nhật `OnboardingSummary` thêm hàng thông tin Trình độ hiện tại
- `apps/student/src/components/onboarding/onboarding-wizard.tsx`:
  - Thêm state `currentLevel: CurrentLevelOption | null`
  - Nâng cấp số bước lên 5, cập nhật tiến độ `Bước X/5` và 5 thanh chỉ báo
  - Reset cả `targetScore` và `currentLevel` khi thay đổi `examInterest`
  - Thêm bước render `CurrentLevelStep` ở bước 1, dời các bước sau tương ứng

## Tasks & Steps

### Task 2.1 — Cập nhật backend routes xử lý currentLevel
- Goal: Server lưu `currentLevel` khi submit onboarding và trả về trong DTO `StudentMe`.
- Target files: `apps/server/src/routes/student.ts`
- Steps:
  1. Trong `apps/server/src/routes/student.ts`, import `CURRENT_LEVEL_OPTIONS` từ `@teacher-os/api/contracts`.
  2. Trong hàm `buildStudentMe`:
     Thêm `currentLevel: parseEnum(s.currentLevel ?? null, CURRENT_LEVEL_OPTIONS),` vào object `student`.
  3. Trong handler `POST /api/student/onboarding`:
     Lấy `currentLevel` từ `parsed.data` và đưa vào câu lệnh `db.update(student).set({ ..., currentLevel })`.
- Success criteria: Server build thành công và typecheck thông qua.
- Verify: `pnpm --filter server check-types` exits 0.

### Task 2.2 — Bổ sung CurrentLevelStep và cập nhật OnboardingSummary
- Goal: Cung cấp component giao diện hiển thị các lựa chọn trình độ theo kỳ thi và tóm tắt thông tin đầy đủ.
- Target files: `apps/student/src/components/onboarding/onboarding-steps.tsx`
- Steps:
  1. Import `CURRENT_LEVEL_OPTIONS`, `type CurrentLevelOption` từ `@teacher-os/api/contracts`.
  2. Khai báo từ điển nhãn:
     ```ts
     export const CURRENT_LEVEL_LABELS: Record<
       ExamInterest,
       Record<CurrentLevelOption, { label: string; sub?: string }>
     > = {
       ielts: {
         beginner: { label: "Mới bắt đầu", sub: "Mất gốc hoặc chưa học IELTS" },
         basic: { label: "Dưới 4.5", sub: "Trình độ cơ bản" },
         intermediate: { label: "4.5 – 5.5", sub: "Giao tiếp và xử lý đề cơ bản" },
         "upper-intermediate": { label: "6.0 – 6.5", sub: "Đã có nền tảng vững" },
         advanced: { label: "7.0 trở lên", sub: "Thành thạo" },
         unsure: { label: "Chưa rõ", sub: "Chưa từng thi hoặc tự đánh giá" },
       },
       toeic: {
         beginner: { label: "Mới bắt đầu", sub: "Mất gốc hoặc chưa học TOEIC" },
         basic: { label: "Dưới 350", sub: "Trình độ cơ bản" },
         intermediate: { label: "350 – 550", sub: "Nắm được ngữ pháp nền" },
         "upper-intermediate": { label: "550 – 750", sub: "Khả năng nghe đọc tốt" },
         advanced: { label: "750 trở lên", sub: "Thành thạo trong công việc" },
         unsure: { label: "Chưa rõ", sub: "Chưa từng thi hoặc tự đánh giá" },
       },
     };
     ```
  3. Export hàm helper `getCurrentLevelLabel(level: string | null | undefined, examInterest?: string | null): string`.
  4. Tạo component `CurrentLevelStep({ examInterest, value, onSelect })` tương tự `TargetScoreStep`, hiển thị tiêu đề "Trình độ hiện tại của bạn?", mô tả ngắn và grid 2-3 cột các lựa chọn với `OptionButton` hoặc style button đồng bộ.
  5. Cập nhật `OnboardingSummary`: thêm hàng "Trình độ hiện tại" hiển thị kết quả bằng `getCurrentLevelLabel(answers.currentLevel, answers.examInterest)`.
- Success criteria: Component render đầy đủ các mức, không phát sinh lỗi types.
- Verify: `pnpm --filter student check-types` exits 0.

### Task 2.3 — Nâng cấp OnboardingWizard thành 5 bước
- Goal: Tích hợp `CurrentLevelStep` vào luồng wizard hoàn chỉnh.
- Target files: `apps/student/src/components/onboarding/onboarding-wizard.tsx`
- Steps:
  1. Thêm `currentLevel: CurrentLevelOption | null` vào state `answers` (khởi tạo `null`).
  2. Cập nhật `isStep1Valid = answers.currentLevel !== null && CURRENT_LEVEL_OPTIONS.includes(answers.currentLevel)`.
  3. Dời các validation bước sau: `isStep2Valid` (targetScore), `isStep3Valid` (learningGoals), `isStep4Valid` (studyHours).
  4. Cập nhật `isCurrentStepValid` switch case từ 0..4.
  5. Sửa điều kiện submit: kiểm tra `!answers.currentLevel`.
  6. Thêm `currentLevel: answers.currentLevel` vào payload `StudentOnboardingPayload`.
  7. Cập nhật Progress Indicator: `Bước {Math.min(step + 1, 5)}/5` và mảng 5 dots `[0, 1, 2, 3, 4]`.
  8. Trong bước 0 (`ExamInterestStep`), khi đổi kỳ thi reset cả `targetScore` và `currentLevel`.
  9. Render bước:
     - `step === 0`: `ExamInterestStep`
     - `step === 1 && answers.examInterest`: `CurrentLevelStep`
     - `step === 2 && answers.examInterest`: `TargetScoreStep`
     - `step === 3`: `LearningGoalsStep`
     - `step === 4`: `StudyHoursStep`
     - `step === 5`: `OnboardingSummary`
  10. Cập nhật nút "Tiếp tục" / "Hoàn thành" hiển thị theo ngưỡng `step < 5`.
- Success criteria: Toàn bộ luồng 5 bước hoạt động liền mạch từ chọn kỳ thi đến nộp dữ liệu.
- Verify: `pnpm --filter student check-types` exits 0.

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
