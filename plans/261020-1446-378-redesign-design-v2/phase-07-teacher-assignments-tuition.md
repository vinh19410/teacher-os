---
phase: 7
title: "Giáo viên: bài tập, đề thi, chấm bài, học phí, vocab"
status: completed
priority: P1
effort: "7h"
dependencies: [4]
---

# Phase 7: Bài tập, đề thi, chấm bài, học phí, vocab

## Goal

Khoác bố cục v2 cho nhóm IELTS + Kinh doanh của giáo viên, giữ nguyên editor/quiz runtime.

## Files to Create / Modify

| Màn | Route | File chính | Design tham chiếu |
|---|---|---|---|
| t-assignments | `_auth/assignments/index.tsx` | `assignments/status-tag.tsx`, `ui/chip-filter.tsx` | `Assignments({query})`: filter trong URL, nhóm chip skill → part |
| (pattern) | `_auth/assignments/new.tsx`, `$assignmentId.tsx`, `preview.tsx` | `assignments/*` (prompt-composer, editors) | khung Card/Field v2 của `TestBuilder` |
| t-test-builder | `_auth/assignments/tests/{new,$id,preview}.tsx` | `assignment-tests/*` | `TestBuilder()` |
| t-grading | `_auth/grading/$attemptId.tsx` | `grading/*` (`annotatable-essay`, `band-slider`, `grade-form`) | `Grading()`: 2 cột bài làm \| form 4 tiêu chí, `mark.anno` |
| t-tuition | `_auth/tuition/index.tsx` | `tuition/revenue-chart.tsx`, `modals/add-invoice-modal.tsx`, `invoice-payment-modal.tsx` | `Tuition()`: stat + chart + bảng hóa đơn + giao dịch chưa khớp |
| t-invoice | `_auth/tuition/$invoiceId.tsx` | `tuition/invoice-status-cell.tsx`, `payment-qr-panel` | `InvoiceDetail()` |
| (pattern) | `_auth/vocab/index.tsx` | `vocab/*` | `VocabCatalog` (khung card + segmented) |

## Tasks & Steps

1. Assignments list: giữ filter URL + debounce 300ms + nhóm chip có nhãn (AGENTS.md); chỉ đổi style.
2. Giữ class móc `assign-item` (e2e `teacher-grade-submission`, `class-assign`).
3. Quiz components dùng chung trong `packages/ui/src/components/quiz/*` — chỉ đổi token/khung,
   giữ verdict (`--verdict-*` + icon ✓/✗) vì ngoại lệ chấm điểm vẫn đúng ở v2.
4. Tuition: badge trạng thái theo `TuitionBadge` v2 (paid chấm emerald, partial amber, due muted,
   overdue destructive); revenue chart màu `--chart-*`; selector `.grid.grid-cols-3 > div`
   (`tuition-revenue-chart`, `create-invoice`) → testid cùng commit.
5. Rich text editor (Tiptap) placeholder/toolbar theo token v2.

## Verification

- `pnpm --filter web test -- assignments grading tuition vocab rich-text`
- e2e: `assignment-*`, `teacher-grade-submission`, `class-assign`, `create-invoice`,
  `tuition-*`, `invoice-*`, `vocab-*` (port override).
- `pnpm design:compare --screens t-assignments,t-test-builder,t-grading,t-tuition,t-invoice --side app --label new` → PASS.
