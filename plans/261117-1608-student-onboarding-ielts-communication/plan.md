---
title: Student onboarding chỉ cho chọn IELTS và Giao Tiếp (bỏ TOEIC)
status: completed
mode: tdd
branch: vinh19410/makara
---

# Student onboarding: IELTS + Giao Tiếp, bỏ TOEIC

## Outcome

Wizard onboarding ở portal học viên chỉ cho chọn **IELTS** hoặc **Giao Tiếp**. TOEIC
không còn là lựa chọn mới; học viên cũ đã lưu TOEIC vẫn hiển thị đúng trên dashboard.

## Quyết định đã chốt với người dùng

- Giao Tiếp dùng thang **CEFR**: mục tiêu `A2, B1, B2, C1, C2`; trình độ hiện tại
  dùng lại 6 key `CURRENT_LEVEL_OPTIONS` với nhãn CEFR (Mới bắt đầu / A1–A2 / B1 / B2 / C1+ / Chưa rõ).
- Dữ liệu TOEIC cũ: **giữ hiển thị, chặn chọn mới**. Không migration DB.

## Thiết kế

- `packages/api/src/contracts.ts`
  - `EXAM_INTERESTS = ["ielts", "communication"]` (lựa chọn hợp lệ cho POST onboarding).
  - `STORED_EXAM_INTERESTS = ["ielts", "toeic", "communication"]` + type `StoredExamInterest` (đọc dữ liệu cũ).
  - `CEFR_TARGET_LEVELS = ["A2","B1","B2","C1","C2"]`; giữ `TOEIC_TARGET_SCORES` cho legacy read.
  - `getTargetScoreOptions(exam)` — một nguồn duy nhất cho contract superRefine, server parse, wizard.
- `apps/server/src/routes/student.ts`: `buildStudentMe` parse examInterest theo `STORED_EXAM_INTERESTS`, targetScore qua `getTargetScoreOptions`.
- `apps/student`: wizard + steps + summary + dashboard stat card hỗ trợ `communication`; copy không còn gọi Giao Tiếp là "chứng chỉ/kỳ thi".
- DB: chỉ cập nhật doc comment cột `exam_interest`.

## Non-goals

- Không đổi TOEIC ở phía giáo viên (assignment presets, vocab, add-student modal).
- Không xoá/migrate dữ liệu TOEIC đã lưu.

## Acceptance criteria

1. Bước 1 wizard hiển thị đúng 2 lựa chọn: IELTS, Giao Tiếp; không có TOEIC.
2. Chọn Giao Tiếp → bước trình độ hiển thị nhãn CEFR; bước mục tiêu hiển thị A2–C2; submit thành công.
3. `POST /api/student/onboarding` với `examInterest: "toeic"` trả 400; `communication` + `B2` trả 200; `communication` + `6.5` trả 400.
4. `GET /api/student/me` của học viên cũ có `toeic`/`750` vẫn trả `examInterest: "toeic"`, `targetScore: "750"`; dashboard hiển thị nhãn TOEIC.
5. `pnpm exec biome check .`, `pnpm check-types`, test student/server/api liên quan pass.

## Phase 1 — Implement (TDD)

1. Cập nhật test trước: `apps/student/test/onboarding.test.tsx`, `apps/server/src/student.test.ts`, test contract nếu có.
2. Sửa contract → server → student UI.
3. Cập nhật e2e spec `apps/e2e/specs/student-portal-onboarding.spec.ts` (thay nút TOEIC bằng Giao Tiếp).

Rủi ro: thấp, không đổi schema DB. Rollback: revert PR.
