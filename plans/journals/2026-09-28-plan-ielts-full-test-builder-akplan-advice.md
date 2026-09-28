---
title: "Plan IELTS Full Test Builder (ak:plan --advice)"
date: 2026-09-28
summary: 6-phase plan nhóm assignment_prompt thành bộ đề IELTS hoàn chỉnh; kongming NEEDS-FIX 8 edit đã áp dụng; 24/24 cites verified
---

# Plan IELTS Full Test Builder (ak:plan --advice)

## What happened
Chạy `/ak:plan --advice` (Hard mode + HOLD scope) tạo plan `plans/260928-0419-ielts-full-test-builder/`: thêm tầng entity "test" phía trên `assignment_prompt` (1 part) để soạn trọn bộ IELTS Reading 3 passages/40 câu/60 phút, mô phỏng Selfomy Quiz Builder (scout qua ak:agent-browser từ trang one.selfomy.com). Kiến trúc: 2 bảng `assignment_test` + `assignment_test_part` (unique `(testId, part)`, FK prompt `restrict`), đánh số liên tục bằng hàm thuần `computeTestRanges` (KHÔNG lưu qStart), Answers Checking (view/paste/compare/apply qua PATCH `/api/assignments/prompts/:id` mới), extensibility 4 skill qua `ASSIGNMENT_TEST_PRESETS` config trong contracts.ts.

## Decision
- Không lưu qStart tính sẵn (drift khi part đổi số câu); `qStartOverride` nullable cho ghi đè chủ động.
- Preview (phase 4) trước Answers Checking (phase 5) vì đánh số là logic rủi ro nhất.
- Collection/Group là text + datalist, không dựng entity. `timeLimitSeconds` nullable. Bật cả 4 preset skill.
- Interview 4 decision points: user chưa phúc đáp, áp dụng phương án Recommended (ghi rõ override path trong Validation Log plan.md).

## Key findings (kongming checkpoints #1, #2)
- D1 `DrizzleD1Database` không có `.transaction()` → dùng `db.batch([...])` (precedent kernel.ts:793).
- Mắt xích snapshot-chain hay bị bỏ: `mock-data.ts` `KernelHydratedData` (dòng 218) phải mở rộng TRƯỚC `emptyKernelData`, và `mapKernelSnapshot` (repos/kernel.ts:252) phải wire mapper — thiếu 1 trong 2 làm phase sau vỡ.
- `AssignmentQuestion.alts` là `string` (join " / "), không phải mảng.
- e2e boot.ts wipe DB mỗi chạy — không có seed; playwright filter là positional.
- Baseline trước plan: `pnpm -F web test` 90 file/990 test xanh.

## Next steps
- Duyệt plan (đặc biệt 4 override points trong Validation Log) rồi `/ak:cook /Users/vinhtran/Documents/project/personal/teacher-os/plans/260928-0419-ielts-full-test-builder/plan.md`.
- Plan là handover-ready (--advice contract): mỗi task có Verify cơ học + Failure Protocol kongming escalation.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
