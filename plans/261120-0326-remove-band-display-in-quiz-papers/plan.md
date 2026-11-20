---
title: "Bỏ hiển thị band điểm khi practice và trong bài làm"
description: "Loại bỏ nhãn Band độ khó của đề khỏi giao diện bài làm học viên (QuizPaper, Start Gate) và cả 3 bề mặt Xem trước phía học viên, giữ nguyên band kết quả đã chấm và metadata quản trị."
status: completed
priority: P1
effort: "2h"
tags: [ui, student, web, quiz-paper, practice]
created: 2026-11-20
---

# Bỏ hiển thị band điểm khi practice và trong bài làm

## Overview

Hiện tại khi học viên mở bài luyện tập (`/learn/quizzes/practice/$testId`), bài tập được giao (`/learn/quizzes/$assignmentId`), hoặc xem chi tiết bài đã nộp (`/learn/quizzes/attempt/$attemptId/detail`), giao diện đang hiển thị nhãn độ khó của đề dạng `LISTENING · BAND 7.0` trên đầu trang đề (`QuizPaper`) và `… · Band 7.0` trên thẻ Start Gate (`QuizTakeView`). Các màn hình xem trước phía học viên cho giáo viên/admin (`TestPreviewOverlay`, `PreviewQuizSimulation`, `StudentPreviewPaper`, `PromptPreviewAside`, và khối `SelectedPromptPreviewContent` trong `AssignClassPromptModal`) cũng hiển thị nhãn này.

Mục tiêu là bỏ hoàn toàn việc hiển thị band độ khó của đề trong bài làm và tất cả các bề mặt xem trước phía học viên, đồng thời giữ nguyên:
- Band kết quả đã chấm (`AttemptGradeCard`, `WritingReview`, `ClassDetailView`, `PlacementGradedResultView`, `PlacementPendingResultView`, hàng chờ chấm & bảng học viên phía giáo viên).
- Band mục tiêu (onboarding), trình độ lớp (`class.level`), form nhập/chỉnh band ở trang soạn đề/admin, danh sách ngân hàng đề phía giáo viên, tab `"Đề & Đáp án"` của `StudyPackItemViewer`, và schema/API contract (`band` vẫn giữ trong DB & DTO để không breaking).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bỏ hiển thị `· Band {detail.band}` trên đầu `QuizPaper` (dùng chung cho Practice, Bài tập được giao, Soi chi tiết `/detail`, Admin preview overlay `TestPreviewOverlay`, Teacher simulation `PreviewQuizSimulation` và tab "Làm thử" của `StudyPackItemViewer`) | P1 |
| 2 | Bỏ hiển thị `· Band {detail.band}` trên Start Gate của `QuizTakeView` (cả 3 nhánh Speaking, Writing, và Auto-graded / Hybrid) | P1 |
| 3 | Bỏ toàn bộ hiển thị Band (cả dòng spec lẫn chip `<Tag>Band ...</Tag>`) trên cả 3 thẻ "Xem trước phía học viên" (`StudentPreviewPaper`, `PromptPreviewAside`, `SelectedPromptPreviewContent` trong `AssignClassPromptModal`) và cập nhật unit test + E2E spec tương ứng | P1 |

## Non-Goals

- Không xoá cột `band` trong database hay field `band` trong API contracts (`StudentQuizDetail`, `AssignmentPrompt`, `LibraryPartDto`, `LibraryPartInput`).
  - **Threat Model note:** `band` là metadata độ khó của đề (không phải answer key/transcript); giữ nguyên trên wire giúp rolling deploy an toàn và không gây breaking change.
- Không bỏ hiển thị **điểm band đã chấm** của học viên (Writing/Speaking `Band tổng` trong `AttemptGradeCard`, `WritingReview`, `Band trung bình` trong `ClassDetailView`, `PlacementGradedResultView` / `PlacementPendingResultView`, hàng chờ chấm `/grading`, bảng bài tập lớp và trang học viên).
- Không bỏ field nhập band ở form soạn đề giáo viên (`prompt-composer.tsx`) / admin (`part-content-fields.tsx`), danh sách chọn đề ở ngân hàng đề (`/assignments`) và danh sách đề trong modal giao bài (`assign-class-prompt-modal.tsx:629`), hay badge `detail.band` ở tab `"Đề & Đáp án"` của `StudyPackItemViewer` (`study-pack-item-viewer.tsx:457`, metadata dành cho giáo viên).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Bỏ Band trong QuizPaper & QuizTakeView Start Gate](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Đồng bộ Xem trước phía học viên, E2E & Kiểm chứng](./phase-02-teacher-preview-and-verification.md) | Pending |

## Success Criteria

- [x] `QuizPaper` (`packages/ui/src/components/quiz/quiz-paper.tsx`) chỉ hiển thị `{SKILL_LABELS[skill] ?? skill}` và `{detail.level}` (nếu có), không hiển thị `Band {detail.band}` ở cả `mode="take"` và `mode="review"`.
- [x] Start Gate của `QuizTakeView` (`apps/student/src/components/quiz/quiz-take-view.tsx`) không hiển thị `· Band {detail.band}` ở cả 3 nhánh: Speaking, Writing, và Auto-graded/Hybrid (cả `practice` lẫn `assignment`).
- [x] Cả 3 bề mặt "Xem trước phía học viên" (`StudentPreviewPaper`, `PromptPreviewAside`, `SelectedPromptPreviewContent` trong `AssignClassPromptModal`) không còn hiển thị `Band` (cả dòng spec lẫn chip `<Tag>Band ...</Tag>`).
- [x] Unit tests (TDD) bao phủ đủ `QuizPaper`, `QuizTakeView`, `TestPreviewOverlay`, `PreviewQuizSimulation`, `StudentPreviewPaper`, `PromptPreviewAside`, `AssignClassPromptModal`, `PreviewAssignmentRoute` đều pass; E2E spec `apps/e2e/specs/hybrid-multi-skill-assignment.spec.ts` được cập nhật với `{ exact: true }` + phủ định `Band 7.0`, đồng thời 2 spec E2E `student-practice.spec.ts` & `student-quiz-take-review.spec.ts` chạy pass 15/15 tại local.
- [x] Các cổng chất lượng local (`pnpm exec biome check .`, `turbo check-types --concurrency=1`, unit tests các package liên quan) đều xanh.

## Red Team Review

### Session — 2026-11-20
**Reviewers:** Security Adversary + Assumption Destroyer (2 independent reviewers, 2-phase plan)
**Findings:** 5 deduplicated (1 Critical, 2 High, 2 Medium — 4 accepted, 1 partial accept)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Quyết định chưa chốt ở Phase 2 cho `<Tag>Band ...</Tag>` + bỏ sót thẻ xem trước thứ 3 (`assign-class-prompt-modal.tsx:1096`) và chưa phân loại `StudyPackItemViewer` (`study-pack-item-viewer.tsx:457`) | Critical | Accept | `plan.md`, Phase 2 |
| 2 | `band` vẫn nằm trên wire API học viên (`student.ts:1795`, `student-practice.ts:150`) & prop `band` trong `QuizPaperDetail` | High | Partial Accept (ghi nhận Threat Model giữ wire contract theo quyết định user A2; giữ tương thích kiểu `QuizPaperDetail` & đổi `StudentPreviewPaper.band` thành optional `band?: string`) | `plan.md`, Phase 1, Phase 2 |
| 3 | E2E assertion `hybrid-multi-skill-assignment.spec.ts:219` dùng `exact: false` (substring match) & thiếu bước chạy spec E2E lẻ tại local (cần khôi phục `plans/reports/574-*.png`) | High | Accept | Phase 2 |
| 4 | Tên symbol chưa chính xác (`LibraryTestPart`, `PlacementResultViews`) & thiếu suite test gọi `QuizPaper` trong Phase 1 Verification | Medium | Accept | `plan.md`, Phase 1 |
| 5 | TDD matrix Phase 1 thiếu nhánh Auto thuần (`hasHybridWriting: false`) / nguồn `practice`, thiếu ghi chú reset `mockDetail.writing`, và thiếu assertion phủ định `Band` ở `TestPreviewOverlay` & `PreviewQuizSimulation` | Medium | Accept | Phase 1 |

**Whole-Plan Consistency Sweep:** Pass — toàn bộ đường dẫn file, số dòng, tên symbol, lệnh test, và ranh giới phạm vi giữa `plan.md`, `phase-01-start.md`, và `phase-02-teacher-preview-and-verification.md` đều khớp nhau, không còn placeholder.

## Validation Log

### Session 1 — 2026-11-20
- **Questions asked:** 3 (phạm vi 3 thẻ Xem trước phía học viên + `StudyPackItemViewer`, ranh giới giữ nguyên Band kết quả đã chấm & API contract, phê duyệt áp dụng Red-Team findings và triển khai `--ship --beta`).
- **Confirmed Decisions:**
  1. **Xem trước phía học viên & Study Pack:** Bỏ toàn bộ Band (cả dòng spec lẫn chip `<Tag>Band ...</Tag>`) trên cả 3 thẻ `"Xem trước phía học viên"` (`StudentPreviewPaper`, `PromptPreviewAside`, `SelectedPromptPreviewContent` trong `AssignClassPromptModal`); giữ nguyên danh sách ngân hàng đề, form soạn đề và tab `"Đề & Đáp án"` của `StudyPackItemViewer`.
  2. **Ranh giới giữ nguyên:** Giữ nguyên Band kết quả đã chấm, Band mục tiêu/lớp, form soạn đề và field `band` trong DB/API (chỉ bỏ hiển thị trên UI bài làm).
  3. **Red-Team & Thực thi:** Chấp thuận toàn bộ chỉnh sửa Red-Team và tiến hành triển khai trọn gói pipeline `/ak-vibe --ship --beta`.
- **Verification Results:** `Passed: 100%` | `Failed: 0` | `Unverified: 0`.

<!-- slug: remove-band-display-in-quiz-papers -->
