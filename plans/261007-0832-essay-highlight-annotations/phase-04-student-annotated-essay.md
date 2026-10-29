---
phase: 4
title: "Student: hiện highlight + ghi chú ở màn kết quả"
status: completed
priority: P2
effort: "1.5h"
dependencies: [1, 2, 3]
---

# Phase 4: Student — hiện highlight + ghi chú ở màn kết quả

## Goal

Màn kết quả attempt Writing đã chấm hiện essay với highlight đánh số và danh sách "Ghi chú của giáo viên". Bài chưa chấm hoặc không có highlight giữ nguyên như hiện tại.

## Files to Create / Modify

- Create: `apps/student/src/components/quiz/essay-annotation-list.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` (nhánh `essay !== null`, quanh dòng 157–183)
- Modify: `apps/student/test/attempt-summary.test.tsx`

## Tasks & Steps

### 4.1 Render essay có highlight

Trong nhánh `essay !== null`:
- `const annotations = summary.annotations ?? [];`
- Essay khác rỗng: thay text node `{essay}` bằng `<EssayWithHighlights essay={essay} annotations={annotations} />` (component Phase 3, import từ `@teacher-os/ui/components/quiz/essay-with-highlights`). Giữ nguyên khối bao `mt-2 whitespace-pre-wrap rounded-md border border-line bg-bg p-4 text-[15px] leading-[1.7]` (truyền qua `className` hoặc giữ div bao ngoài; không đổi giao diện khi `annotations` rỗng).
- Không truyền `markProps`: highlight phía học viên chỉ để đọc, không focus được.
- Essay trống: giữ dòng "Bạn đã nộp bài trống.".

### 4.2 Danh sách ghi chú `EssayAnnotationList`

```tsx
export function EssayAnnotationList({ essay, annotations }: { essay: string; annotations: EssayAnnotation[] })
```
- Trả `null` khi `orderedAnnotations(essay, annotations)` rỗng.
- Tiêu đề `h3` "Ghi chú của giáo viên" dùng class `mt-4 font-medium text-fg text-sm` (cùng tiêu đề "Nhận xét" ở `attempt-grade-card.tsx:58`).
- `<ol data-testid="essay-annotation-list">`; mỗi `li`: số `n` (`font-mono text-xs text-meta`), trích đoạn trong ngoặc kép (cắt 80 ký tự, `text-muted-fg`), ghi chú `whitespace-pre-wrap text-fg` (rỗng thì chỉ hiện trích đoạn).
- Đặt ngay dưới khối essay, trước `AttemptGradeCard`.

Không cần điều kiện "đã chấm" ở client: server chỉ gửi `annotations` khi đã chấm (Phase 2.6). Client chỉ đọc `?? []`.

### 4.3 Test `attempt-summary.test.tsx`

Theo pattern case "Writing đã chấm" (dòng ~325):
1. Writing đã chấm + 2 annotation → có 2 `mark` với `data-n` 1, 2; danh sách có 2 mục đúng trích đoạn và ghi chú; `textContent` của khối essay bằng essay gốc.
2. Writing đã chấm, không có key `annotations` → không có `mark`, không có danh sách; vẫn hiện grade card (hồi quy).
3. Writing chưa chấm (không có `grade`, không có `annotations`) → giữ dòng "Giáo viên sẽ chấm bài viết của bạn.".
4. Ghi chú chứa `<b>x</b>` → render dạng text.

## Verification

- `pnpm --filter student test` xanh.
- `pnpm check-types`, `pnpm check` xanh.
- Mở màn kết quả attempt đã chấm có highlight ở 375×812 và 1440×900: highlight đọc được, số thứ tự không đè chữ, danh sách xuống dòng đúng.

## Failure Protocol

- Student app không resolve được import `@teacher-os/ui/components/quiz/essay-with-highlights`: kiểm `exports` của `packages/ui/package.json` (`./components/*`) và precedent import `@teacher-os/ui/components/quiz/attempt-score-card` ở chính route `$attemptId.tsx:23`; không copy component sang student.
