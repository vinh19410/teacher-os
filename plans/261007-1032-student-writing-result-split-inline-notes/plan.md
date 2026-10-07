---
title: "Màn kết quả Writing: chia 2 khung trái/phải, ghi chú hiện inline"
description: "Ở màn kết quả học viên, bài Writing đã chấm hiện thành 2 khung: bài viết bên trái, kết quả chấm bên phải. Ghi chú của giáo viên hiện ngay sau đoạn được highlight thay cho danh sách riêng dưới bài."
status: pending
priority: P2
effort: "4h"
issue: 336
branch: develop
tags: [feature, frontend, student, grading]
blockedBy: []
blocks: []
created: 2026-10-07
---

# Màn kết quả Writing: chia 2 khung trái/phải, ghi chú hiện inline

## Overview

Màn kết quả học viên `/learn/quizzes/attempt/$attemptId` (route [`$attemptId.tsx`](../../apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx)) hiện bài Writing đã chấm thành một cột rộng 720px, xếp từ trên xuống:

1. Dòng "Bạn đã nộp bài lúc…".
2. "Bài viết của bạn": số từ và essay có highlight đánh số (`EssayWithHighlights`).
3. Danh sách "Ghi chú của giáo viên" (`EssayAnnotationList`), mỗi mục là trích đoạn kèm ghi chú.
4. Card "Kết quả chấm của giáo viên" (`AttemptGradeCard`): band tổng, 4 tiêu chí, nhận xét.

Học viên phải cuộn qua essay rồi dò số ở danh sách để biết ghi chú nào của đoạn nào, và cuộn tiếp mới thấy band. Plan này đổi thành:

- **Khung trái:** bài viết, mỗi ghi chú hiện ngay sau đoạn được highlight (đọc liền mạch, không cần bấm).
- **Khung phải:** kết quả chấm (band, tiêu chí, nhận xét), dính ở đầu màn hình khi cuộn essay.
- Bỏ danh sách "Ghi chú của giáo viên" vì nội dung đã nằm inline.

```text
≥ 921px (app)                                         < 921px
┌──────────────────────────────────────────────────┐  ┌──────────────────────┐
│ Bạn đã nộp bài lúc …                             │  │ Bạn đã nộp bài lúc … │
├─────────────────────────────┬────────────────────┤  │ Bài viết của bạn     │
│ Bài viết của bạn · 182 từ   │ Kết quả chấm của   │  │ … [clear]¹ ┊Đúng từ.┊│
│ The graph shows a [clear]¹  │ giáo viên (sticky) │  │ …                    │
│ ┊Đúng từ.┊ upward trend,    │ 6.5  Band tổng     │  ├──────────────────────┤
│ [rising]² ┊Dùng increasing.┊│ Task … 6.0         │  │ Kết quả chấm …       │
│ …                           │ Nhận xét …         │  └──────────────────────┘
└─────────────────────────────┴────────────────────┘
```

## Key Decisions (user chốt 2026-10-07)

1. **Ghi chú hiện ngay sau highlight.** Sau mỗi `<mark>` có ghi chú khác rỗng, chèn một `<span data-testid="essay-inline-note">` chứa ghi chú, cùng dòng chảy với văn bản. Highlight không có ghi chú (ghi chú rỗng) chỉ có mark, không chèn gì.
2. **Bỏ danh sách "Ghi chú của giáo viên"** ở màn học viên. Xoá `apps/student/src/components/quiz/essay-annotation-list.tsx`. Trang chấm của giáo viên giữ nguyên danh sách của nó (danh sách đó là chỗ sửa/xoá highlight).
3. **Ghi chú inline là prop opt-in `inlineNotes` của `EssayWithHighlights`** (mặc định `false`). Trang chấm của giáo viên không bật, nên bất biến "mỗi phần tử render đúng một text node, offset = `data-start` + caret" mà phép bôi đen dựa vào vẫn giữ nguyên. Doc comment ghi rõ: không bật `inlineNotes` ở essay bôi đen được.
4. **Kiểu hiển thị ghi chú inline** theo token sẵn có, không thêm màu: viền trái `border-l-2 border-warn` (cùng họ màu với nền highlight `bg-warn-soft`), nền `bg-surface`, chữ `text-fg-2 text-sm`, `rounded-sm px-1.5 py-0.5 mx-1`, `box-decoration-clone` để ghi chú xuống dòng vẫn giữ nền/viền ở mỗi dòng. Phía trước có `<span className="sr-only">Ghi chú {n}: </span>` để trình đọc màn hình biết đây là ghi chú của highlight số n. Plain text qua JSX text node như hiện tại (không HTML, không XSS).
5. **Chỉ chia 2 khung khi bài Writing đã có điểm** (`summary.grade` khác null). Bài chưa chấm giữ một cột 720px như hiện nay (khung phải sẽ trống). Speaking và Reading/Listening không đổi.
6. **Breakpoint `app` (≥ 921px)**, cùng breakpoint với trang chấm của giáo viên (`max-app:grid-cols-1` ở [grading `$attemptId.tsx:194`](../../apps/web/src/routes/_auth/grading/$attemptId.tsx)). Tỉ lệ cột `minmax(0,3fr) minmax(0,2fr)`, `gap-6`, `items-start`. Khung `main` nới từ `max-w-[720px]` lên `max-w-[1120px]` khi chia 2 khung. Dưới 921px xếp dọc theo thứ tự DOM: bài viết trước, kết quả chấm sau (khớp thứ tự đọc trái → phải).
7. **Khung phải dính khi cuộn:** `app:sticky app:top-20` (header runtime cao `h-14` + khoảng thở). Card có `app:max-h-[calc(100svh-6rem)] app:overflow-y-auto` để nhận xét dài không bị che, và `tabIndex={0}` + focus ring theo `DESIGN.md` để vùng cuộn dùng được bằng bàn phím.
8. **`AttemptGradeCard` nhận thêm prop `className`** (gộp bằng `cn`) để nhánh Writing chia khung bỏ `mt-6` ở ≥ 921px và thêm sticky. Nhánh Speaking gọi không đổi.

## Non-Goals

- Đổi trang chấm của giáo viên (`apps/web`), API, contract hoặc dữ liệu `annotations`.
- Ghi chú dạng popover/tooltip, ghi chú bên lề (kiểu Google Docs) hoặc gom ghi chú cuối đoạn văn.
- Đồng bộ cuộn giữa highlight và khung phải, bấm highlight để nhảy tới ghi chú.
- Kéo đổi độ rộng 2 khung.
- Đổi bố cục màn kết quả Speaking, Reading/Listening hoặc bài Writing chưa chấm.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Ghi chú inline trong `EssayWithHighlights`](./phase-01-inline-notes-shared-component.md) | pending | 1h |
| 2 | [Màn kết quả Writing chia 2 khung + bỏ danh sách ghi chú](./phase-02-student-split-layout.md) | pending | 1.5h |
| 3 | [E2E + CHANGELOG + gate cuối](./phase-03-e2e-docs-gates.md) | pending | 1.5h |

Chạy tuần tự 1 → 2 → 3. Phase 2 dùng prop `inlineNotes` của Phase 1.

## Success Criteria

- [ ] Ở ≥ 921px, bài Writing đã chấm hiện 2 khung: bài viết bên trái, "Kết quả chấm của giáo viên" bên phải; cuộn essay dài thì khung phải vẫn ở đầu màn hình.
- [ ] Mỗi highlight có ghi chú hiện ghi chú ngay sau đoạn tô (`mark[data-n="1"] + [data-testid="essay-inline-note"]`); highlight không có ghi chú không chèn gì.
- [ ] Không còn danh sách "Ghi chú của giáo viên" (`essay-annotation-list`) ở màn học viên.
- [ ] Dưới 921px (768×1024, 375×812) xếp dọc: bài viết rồi kết quả chấm, không tràn ngang; ghi chú dài xuống dòng vẫn giữ nền và viền.
- [ ] Bài Writing chưa chấm, Speaking, Reading/Listening hiện như cũ.
- [ ] Trang chấm của giáo viên không đổi: không có `essay-inline-note`, bôi đen tạo highlight vẫn đúng offset (e2e `teacher-essay-annotations` xanh).
- [ ] Ghi chú chứa HTML vẫn render dạng text.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter student test` và e2e `teacher-essay-annotations`, `student-quiz-take-review`, `teacher-grade-submission` (ports 8100/8101/8103) đều xanh. PR kèm screenshot 3 viewport.

## Risks

- **Bật nhầm `inlineNotes` ở trang chấm giáo viên** sẽ làm sai offset khi bôi đen (span ghi chú không có `data-start`). Giảm thiểu: prop mặc định `false`, doc comment cảnh báo, test web khẳng định mặc định không render `essay-inline-note`.
- **Card kết quả dài hơn màn hình khi sticky.** Giảm thiểu: `max-h` + `overflow-y-auto` + `tabIndex={0}` (Key Decision 7).
- **Ghi chú dài làm vỡ nhịp đọc essay.** Ghi chú tối đa 1000 ký tự (`QUIZ_ANNOTATION_NOTE_MAX`); `text-sm` + nền khác giúp tách khỏi văn bản. Chấp nhận ở v1 theo lựa chọn của user.

## Dependencies

- Xây trên #332 (highlight + ghi chú, đã merge `develop` ở `b076e46`, `4d6cf69`).
- PR đích: `develop`. CI chỉ chạy cho `main`, gate là bộ lệnh local ở Phase 3 (theo `AGENTS.md`).

## Validation Log

### Session 1 — 2026-10-07

User chốt 2 quyết định trước khi soạn plan:
1. Ghi chú hiện ngay sau highlight (không phải cuối đoạn văn, không phải popover).
2. Bỏ danh sách "Ghi chú của giáo viên" dưới bài viết.

Các mặc định do người soạn plan chọn (không cần hỏi, ghi lại để review): chỉ chia khung khi đã chấm; breakpoint `app` 921px như trang chấm giáo viên; khung phải sticky; dưới breakpoint bài viết đứng trước.

### Verification Results
- Tier: kiểm bằng đọc code trực tiếp.
- Đã xác minh: nhánh Writing ở `AttemptSummaryBody` render `EssayWithHighlights` + `EssayAnnotationList` + `AttemptGradeCard` (`$attemptId.tsx:159-191`); `main` đang `max-w-[720px]` (`$attemptId.tsx:247`); header runtime `sticky top-0 h-14` (`quiz-runtime-header.tsx:41`); student import `@teacher-os/ui/globals.css` (`apps/student/src/index.css:1`) nên có biến thể `app:` từ `--breakpoint-app: 921px` (`globals.css:219`); token `--color-warn`, `--color-warn-soft`, `--color-fg-2`, `--color-surface` có trong `globals.css:138-156`; `EssayAnnotationList` chỉ dùng ở route student; `AttemptGradeCard` dùng ở nhánh Speaking (`:149`) và Writing (`:185`), class `mt-6` cứng (`attempt-grade-card.tsx:27`); test component `packages/ui` chạy trong `apps/web/src/components/ui/essay-with-highlights.test.tsx`; e2e kiểm `essay-annotation-list` ở `teacher-essay-annotations.spec.ts:212,236`.
