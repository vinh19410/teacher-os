---
phase: 2
title: "Màn kết quả Writing chia 2 khung + bỏ danh sách ghi chú"
status: completed
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Màn kết quả Writing chia 2 khung + bỏ danh sách ghi chú

## Goal

Bài Writing đã chấm hiện bài viết (có ghi chú inline) ở khung trái và kết quả chấm ở khung phải dính khi cuộn; bỏ danh sách "Ghi chú của giáo viên".

## Files to Create / Modify

- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`
- Modify: `apps/student/src/components/quiz/attempt-grade-card.tsx`
- Delete: `apps/student/src/components/quiz/essay-annotation-list.tsx`
- Modify: `apps/student/test/attempt-summary.test.tsx`

## Tasks & Steps

1. **`AttemptGradeCard`:** thêm prop `className?: string`, gộp với class hiện có bằng `cn` từ `@/lib/cn` (`cn("mt-6 rounded-md border border-line bg-bg p-4", className)`). Thêm prop `scrollable?: boolean` gói **trọn** hành vi vùng cuộn: khi bật, `<section>` nhận `app:max-h-[calc(100svh-6rem)] app:overflow-y-auto app:overscroll-contain` (repo precedent `overscroll-contain`: `packages/ui/src/components/message-scroller.tsx`), focus ring `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`, và `tabIndex={0}` **chỉ khi** `matchMedia("(min-width: 921px)")` khớp (pattern `APP_MEDIA_QUERY` của `apps/web/src/components/grading/annotatable-essay.tsx:26` — dùng hook nhỏ `useSyncExternalStore`/`useEffect` theo media query; jsdom test mock `window.matchMedia`). Lý do: dưới 921px card không cuộn, `tabIndex` vô điều kiện tạo dead tab stop. Thêm `break-words` cho khối `feedback` (chuỗi dài không khoảng trắng không được tràn cột). Nhánh Speaking gọi không đổi.
2. **Helper bố cục** trong route, export để test:
   ```ts
   /** Writing đã chấm → chia 2 khung (bài viết | kết quả chấm) ở ≥ 921px. */
   export function isSplitWritingResult(summary: QuizAttemptSummary): boolean {
     return summary.skill !== "speaking" && (summary.essay ?? null) !== null && (summary.grade ?? null) !== null;
   }
   ```
   Điều kiện khớp đúng thứ tự nhánh trong `AttemptSummaryBody` (Speaking xét trước, rồi `essay !== null`).
3. **Nhánh Writing của `AttemptSummaryBody`:**
   - Bỏ import và JSX `EssayAnnotationList`; truyền `inlineNotes` cho `EssayWithHighlights`.
   - Cập nhật comment `// Highlight + ghi chú giáo viên (#332)…` thành: ghi chú hiện inline sau highlight, server chỉ gửi `annotations` khi đã chấm.
   - Bọc phần bài viết trong `<section aria-labelledby="essay-heading" data-testid="essay-frame" className="min-w-0">`, `h2` có `id="essay-heading"`.
   - Khi `isSplitWritingResult(summary)` true (dùng helper — một nguồn sự thật duy nhất cho quyết định chia khung, không re-check `grade !== null` inline): bọc `section` bài viết và `AttemptGradeCard` trong
     `<div data-testid="writing-result-split" className="app:grid app:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] app:items-start app:gap-6">`.
     `AttemptGradeCard` nhận `scrollable` và `className="app:sticky app:top-20 min-w-0"` (sticky + chống tràn cột `2fr`; `max-h`/`overflow` đã nằm trong `scrollable`). `mt-6` giữ nguyên ở cả hai cột (h2 bài viết cũng `mt-6`, nằm *bên trong* section — grid item là BFC, margin không collapse), nên đỉnh 2 khung thẳng hàng.
   - Khi `isSplitWritingResult(summary)` false: giữ nguyên một cột như hiện nay (bài viết rồi dòng "Giáo viên sẽ chấm bài viết của bạn."), không có wrapper grid.
   - `submittedLine` vẫn nằm trên cùng, trải hết chiều ngang.
4. **`AttemptSummaryPage`:** `main` dùng `cn("mx-auto w-full flex-1 px-4 py-6", isSplitWritingResult(summary) ? "max-w-[1120px]" : "max-w-[720px]")`.
5. **Xoá** `apps/student/src/components/quiz/essay-annotation-list.tsx`; `grep -rn "EssayAnnotationList\|essay-annotation-list" apps/student` chỉ còn assertion phủ định (`not.toContain("essay-annotation-list")`) trong test.
6. Cập nhật doc comment `AttemptSummaryBody` (thêm: Writing đã chấm chia 2 khung, ghi chú inline).

## Tests (`apps/student/test/attempt-summary.test.tsx`)

Sửa khối `describe("AttemptSummaryBody — Highlight + ghi chú giáo viên (#332)")`:

- "Đã chấm + 2 annotation": giữ kiểm 2 `<mark`, thứ tự `data-n`, đoạn essay nối đủ. Thay kiểm `essay-annotation-list` bằng: có 2 `data-testid="essay-inline-note"`; `"Đúng từ."` đứng sau `>clear</mark>` và trước `upward` trong HTML (`indexOf` so sánh); không còn `essay-annotation-list`.
- Thêm: annotation ghi chú rỗng không sinh `essay-inline-note`.
- "Đã chấm": có `data-testid="writing-result-split"` và grade card nằm sau `essay-frame` trong HTML.
- "`AttemptGradeCard` `scrollable`": render với `scrollable` → `<section>` có class `overflow-y-auto`, `max-h`, `overscroll-contain`, focus ring và `tabIndex="0"`; không `scrollable` → không `tabindex` trong markup, không class `overflow-y-auto` (mock `window.matchMedia` trả `matches: true`).
- "`AttemptGradeCard` `scrollable` dưới 921px": mock `matchMedia` trả `matches: false` → không `tabindex` (không dead tab stop).
- "Chưa chấm": không có `writing-result-split`, không `essay-inline-note`, vẫn "Giáo viên sẽ chấm bài viết của bạn.".
- "Không có key annotations": không `<mark`, không `essay-inline-note`, vẫn có `writing-result-split` và "Kết quả chấm của giáo viên".
- Ghi chú HTML vẫn escape (`&lt;b&gt;x&lt;/b&gt;`) — test hiện có, giữ.
- `isSplitWritingResult`: `true` cho Writing đã chấm (kể cả essay rỗng `""`); `false` cho Writing chưa chấm, Speaking đã chấm, Reading (`essay` null/undefined).
- Các test Speaking/Reading hiện có giữ xanh không sửa (khẳng định không hồi quy).

## Verification

- `pnpm --filter student test` xanh.
- `pnpm check-types` và `pnpm check` xanh.
- Mở dev stack, đăng nhập học viên seed, xem 1 bài Writing đã chấm có highlight ở 1440×900, 768×1024, 375×812: 2 khung ở 1440, xếp dọc ở 768/375, không tràn ngang; ở ≥ 921px Tab tới card kết quả thấy focus ring và card cuộn được khi nhận xét dài; ở 768/375 Tab **không** dừng ở card (không dead tab stop).
