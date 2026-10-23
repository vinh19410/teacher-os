---
title: PR1 question fields + chấm theo tập
date: 2026-10-23
summary: "PR1 của #420: schema câu thêm explanation/answerSet optional, gradeQuiz chấm tập không thứ tự bằng Kuhn; plan qua validate + red-team 16 findings"
---

# PR1 question fields + chấm theo tập (issue #420)

## Chuyện gì đã xảy ra

Vibe pipeline (`--ship --beta --advice`) nhận issue #420 từ board Teacher OS. Plan `plans/261022-1329-library-question-groups/` đã có sẵn trên develop (session trước). Chạy lại 2 gate bắt buộc: **validate** (Full tier, 30 claims — 28 verified, `FIELD_ERROR_TEXT` sai vị trí file, backup local.db có điều kiện) và **red-team** (3 reviewer hostiles: Security/Failure/Assumption — 16 findings duy nhất, 15 Accept apply vào phase files, 1 Reject là semantics PUT full-replace). Kongming GO cho PR1 với 2 delta: verdict deterministic cho khớp cực đại, risk row UI review lệch cặp khớp (PR3).

Implement PR1: `assignmentQuestionSchema` + interface `AssignmentQuestion` thêm `explanation`/`answerSet` (optional, không default — dirty-check web không lệch); `gradeQuiz` tách positional/tập, mỗi tập chấm bằng khớp hai phía cực đại Kuhn.

## Quyết định

- **Kuhn thay greedy**: red-team S2 chỉ ra greedy theo index chấm sai hoán vị hợp lệ khi `alts` làm tập ứng viên giao nhau. Nhóm ≤ 40 câu nên Kuhn rẻ.
- **Deterministic verdict** (kongming): skipped rời đồ thị trước, hai phía duyệt index tăng dần — cùng input luôn ra cùng verdict mỗi câu.
- **Invariant `answerSet`** (red-team S1, cho PR2): mỗi khóa ≥ 2 câu và nằm trọn một nhóm — chặn chấm lẫn giữa nhóm và cheat lặp đáp án.

## Kongming reviews trong session

- Sau gates: GO cho PR1.
- Sau implement: **NO-GO — bug thật trong Kuhn**: `visited.add` trước khi kiểm edge khóa nhầm đường tăng (key không kề vẫn bị đánh dấu visited). Phản ví dụ: q0 `{a,z}`, q1 `{b,z}`, trả (A, Z) → a1 bị `wrong` dù phân bố đúng 2/2 tồn tại. Sửa theo Kuhn chuẩn (chỉ đánh dấu visited trên đỉnh có cạnh) + test hồi quy.
- Ship pre-flight: GO, kèm yêu cầu stage rõ path, tách commit code/docs, `Relates to #420` (không `Closes` — PR2 còn mở).

## Vấn đề gặp

- Một lần `git checkout -- plans/` (dọn screenshot e2e) xóa nhầm toàn bộ plan edits chưa commit — dựng lại đúng từ transcript, cross-check 24 điểm + diff audit. Bài học: revert PNG bằng `git diff --name-only -- '*.png'`.
- `pnpm test` parallel có một lần flaky đỏ vì tải máy (12 test timeout rải rác) — serial từng package đều xanh; full e2e 2 lần EXIT=0.

## Bước tiếp

PR2 (phase 2–5) trên nhánh mới từ develop sau khi PR1 merge: cột `groups` + migration 0044, contract bất biến dải câu, route admin, editor nhóm kiểu Selfomy, e2e.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
