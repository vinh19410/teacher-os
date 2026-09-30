---
title: "Plan #285: teacher quiz preview simulation"
date: 2026-09-30
summary: "Soạn plan 3 phase đưa take+review simulation vào /assignments/preview; red-team 13 findings applied; issue #285"
---

# Plan #285: teacher quiz preview simulation

## What happened
- `/ak-plan --github` cho yêu cầu "apply phần preview bài tập ở giao diện giáo viên" — kế thừa consultation trước đó (review UI chỉ nằm apps/student, chưa áp dụng cho preview giáo viên).
- User chốt scope: chế độ **Làm thử + Soi bài** (interactive, gradeQuiz client-side), **chỉ reading/listening**, bố cục **tab/segmented control** trên `/assignments/preview` (cả `?id=` lẫn draft).
- Scout (Explore agent, 45 tool uses) xác nhận: `gradeQuiz` pure/type-only import chạy client-side được; tiền lệ extraction #284; `packages/api` test-ở-consumer precedent.
- Plan scaffold qua `ak plan create` → 3 phase: (1) move grade-quiz + quiz-parts vào packages/api, (2) move 6 render component vào @teacher-os/ui/components/quiz + prop-hóa AttemptScoreCard, (3) web preview simulation (buildQuizSim strip-key + use-quiz-simulation hook + tabs).
- Red-team 3 reviewer (Security/Failure/Assumption + Fact Checker/Contract Verifier): 21 findings thô → 13 sau dedupe, **accept hết** theo lựa chọn user.

## Decision
- Take-render từ questions **đã strip key** (mirror precedent server `student.ts:886-892`) — không dựa vào renderer bỏ qua field thừa (RT#2).
- State simulation **lift lên route component** + reset theo `simKey` — đổi tab không mất bài làm, đổi `?id=` không stale (RT#3, RT#9).
- Thư mục student quiz còn lại đúng **3 file student-specific** (review-error, lifecycle-dialogs, runtime-header) — success criterion gốc sai inventory 9-file (RT#1, Critical).
- Resolver skill/type đúng công thức StudentPreviewPaper (`skill ?? "writing"`) — tránh mcq render cloze và chấm sai (RT#5).
- Ship 1 PR trọn plan (precedent #284); ẩn textarea "Bài làm mô phỏng" cho đề auto-graded (Validation S1).
- Width-oracle ở tab "Đề bài" (từ #282) ghi rõ là known accepted behavior ngoài scope, không claim security end-to-end (RT#13).

## Next steps
- `/ak:cook plans/260930-0801-teacher-quiz-preview-simulation/plan.md` — branch `vinh19410/issue-285-teacher-quiz-preview-simulation`.
- Gates mỗi phase theo AGENTS.md (scoped e2e từ phase 1-2, full suite phase 3).
- AgentWiki publish skipped (giữ local file làm nguồn thật).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
