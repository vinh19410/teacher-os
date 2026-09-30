---
title: "Phase 4: Reading split-pane — passage trái / bài làm phải"
status: done
priority: P1
effort: 4h
dependencies: [3]
---

# Phase 4: Reading split-pane — passage trái / bài làm phải

## Overview

Đề reading có passage trên take + review screen chia 2 pane cạnh nhau ở viewport
rộng (≥ lg): bài đọc bên trái, bài làm (header cụm + câu hỏi + navigator) bên
phải, MỖI pane có thanh cuộn riêng độc lập. Viewport hẹp (< lg) giữ xếp chồng 1
cột như hiện tại. Các skill khác không đổi layout.

## Context Links

- Plan index: [plan.md](./plan.md)
- Phase trước: [phase-03-take-cluster-instruction-headers.md](./phase-03-take-cluster-instruction-headers.md)
- Take route layout: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:284`–`336`
  (header sticky `h-14`, `<main max-w-[720px]>`, `QuizNavigator` sticky bottom)
- Review route: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
  (cùng bộ QuizPaper/QuizNavigator)
- Passage render: `quiz-paper.tsx:119`–`124` (`RichTextBody` khi
  `skill === "reading"` && passage không rỗng)
- `scrollToQuestion`: `quiz-question-item.tsx:150` (scrollIntoView — tự theo
  scrollable ancestor gần nhất)
- Tailwind v4 (app dùng `@tailwindcss/vite`), tokens `bg-surface/30`,
  `border-line`… theo design system hiện có

## Requirements

- [x] Điều kiện split-pane: `detail.skill === "reading"` và passage không rỗng
      (`!isEmptyRichText(detail.passage)`). Còn lại giữ 1 cột hiện tại.
- [x] Desktop ≥ `lg`: 2 cột ngang (passage trái ~50%, bài làm phải ~50%), chiều
      cao mỗi pane = viewport trừ runtime header (`h-14`) trừ navigator;
      mỗi pane `overflow-y-auto` riêng — cuộn bài đọc KHÔNG làm bài chạy theo
      và ngược lại.
- [x] Mobile < `lg`: xếp chồng (passage trên, bài làm dưới), cuộn trang như
      hiện tại — không tab, không collapse (KISS).
- [x] Pane trái: label "Bài đọc" + `RichTextBody` passage; pane phải: label
      "Bài làm" + intro (nếu có) + option bank/ảnh đề + các cụm câu hỏi
      (Phase 3).
- [x] Ảnh đề/pin overlay + option bank nằm pane PHẢI (thuộc bài làm).
- [x] `scrollToQuestion` từ navigator vẫn đưa câu vào tầm mắt trong pane phải
      (kiểm `scroll-mt-*` đủ cho header cụm dính nếu có).
- [x] Review screen áp cùng layout (passage trái, câu hỏi + verdict phải).
- [x] Không thay đổi logic attempt/autosave/submit — thuần layout.

## Related Code Files

- Modify: `apps/student/src/components/quiz/quiz-paper.tsx` (tách slot: paper
  passage-first render hiện tại → nhận prop `variant: "split" | "stacked"` hoặc
  tách component `QuizReadingLayout` bọc 2 pane — chọn cách ít diff nhất theo
  cấu trúc hiện có)
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`
- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
- Modify test: thêm layout test component take/review trong `apps/student/test/`
- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts` (assert 2 pane +
  cuộn độc lập ở viewport rộng; stacked ở viewport hẹp)

## Implementation Steps

1. Định nghĩa container: grid `lg:grid-cols-2` + `lg:h-[calc(100svh-3.5rem)]`
   (trừ header 56px; navigator sticky bottom nằm trong pane phải để không ăn
   chiều cao pane trái — hoặc để navigator full-width như hiện tại và trừ thêm
   chiều cao của nó, chọn phương án ít can thiệp QuizNavigator).
2. Pane trái `<section aria-label="Bài đọc" className="lg:overflow-y-auto">`;
   pane phải `<section aria-label="Bài làm" className="lg:overflow-y-auto">`.
   Dưới `lg` hai section xếp chồng bình thường (không overflow cứng).
3. Tách render passage ra khỏi luồng chính của `QuizPaper` khi split — giữ
   `QuizPaper` làm nội dung pane phải (đã bỏ passage), passage pane trái dùng
   `RichTextBody` trực tiếp.
4. Test component: đề reading có passage → 2 section aria-label tồn tại, mỗi
   section có class overflow (assert qua testid/aria); đề listening → không
   split; đề reading passage rỗng → không split.
5. Kiểm thủ công qua dev (`pnpm --filter student dev:bare`): kéo cuộn trái
   không kéo phải; navigator bấm câu → pane phải cuộn tới.
6. E2E: mở take reading ở viewport rộng, assert 2 pane + scroll độc lập
   (evaluate scrollTop pane trái sau khi scroll phải); viewport hẹp assert
   xếp chồng; chạy với `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.

## Todo

- [x] Layout 2 pane + trừ chiều cao header/navigator
- [x] Tách passage slot khỏi `QuizPaper` khi split
- [x] Áp cho review screen
- [x] Component tests + e2e scroll độc lập + stacked mobile

## Success Criteria

- Trên desktop: bài đọc và bài làm cuộn độc lập; đầu đề (title/save state/
  Nộp bài) và navigator luôn nhìn thấy — đúng mock đã chốt với user.
- Trên mobile: mọi chức năng như hiện tại (autosave, navigator, guard nộp bài).
- Listening/writing/speaking: layout không đổi (1 cột).
- `pnpm --filter student test`, `pnpm check`, `pnpm check-types`,
  `pnpm --filter e2e e2e` xanh.

## Risk Assessment

- **Chiều cao giữa các breakpoint**: dùng `100svh` + `lg:` để mobile không kẹt
  chiều cao; navigator sticky trong pane phải cần kiểm iOS Safari (backdrop +
  sticky đã dùng ở header hiện tại — theo pattern).
- **`scrollIntoView` trong nested scroll container**: hành vi mặc định cuộn
  mọi ancestor — có thể cuộn cả trang ở mobile; ở desktop pane phải là ancestor
  cuộn duy nhất (pane trái không chứa anchor câu hỏi) → an toàn. Kiểm e2e.
- **Diff lớn ở `QuizPaper`**: giữ `variant` prop thay vì fork component để
  review/take dùng chung và plan `260930-0801` (extract renderer) rebase dễ.

## Security Considerations

- Không đổi data flow; passage render qua `RichTextBody` sanitize như hiện tại.
