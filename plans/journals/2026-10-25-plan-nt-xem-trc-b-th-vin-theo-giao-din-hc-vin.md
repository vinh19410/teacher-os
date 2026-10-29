---
title: "Plan: nút Xem trước bộ đề thư viện theo giao diện học viên"
date: 2026-10-25
summary: "Lập plan #433: overlay Xem trước ở trang soạn đề admin, render bằng component take screen học viên, gồm cả bản nháp"
---

# Plan: nút Xem trước bộ đề thư viện theo giao diện học viên

## What happened
Lập plan `plans/261025-1608-library-test-student-preview/` (issue #433) cho nút Xem trước ở `/library/tests/$testId` (apps/admin).

Khảo sát cho thấy thư viện đề chưa có đường tới học viên (non-goal của plan 261022-1025), nên "giao diện học viên" được hiểu là take screen dùng chung (`QuizPaper`, `QuizNavigator`, `buildQuizParts`). Giáo viên đã có tiền lệ làm thử ở `apps/web` (#285, `preview-quiz-simulation.tsx`).

## Decision
- Dữ liệu = bản đã lưu + bản nháp (`effectivePartsFor`), chuyển đổi ở client, không thêm API.
- Overlay toàn màn hình, làm thử không lưu, tab theo part với số câu liên tục.
- Hàm map `LibraryPartInput → { detail, parts }` đặt ở `packages/api` để luồng clone sau này dùng lại.
- Option bank theo nhóm cần mở rộng `QuizPart.optionBank` + `QuizPaper`. Các cờ nhóm dragDrop/answersInline/splitContent chưa có ở runtime học viên nên chỉ hiện ghi chú.

## Next steps
- Chạy `/ak:cook` theo 3 phase.
- Lưu ý cho plan clone: `toPracticeQuizDetail` hiện chỉ lấy passage của part đầu.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
