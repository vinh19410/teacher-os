---
phase: 4
title: "Navigator phẳng full-width + e2e + gate cuối"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 4: Navigator phẳng full-width + e2e + gate cuối

## Goal
Navigator không còn hàng tab nhóm, hiện toàn bộ nút số câu theo thứ tự từ trái qua phải, và thanh trải full chiều ngang màn hình. Ở split-pane, thanh nằm dưới cả hai pane thay vì trong pane bài làm.

## Bối cảnh
- `packages/ui/src/components/quiz/quiz-navigator.tsx`: state `activePartIndex` + `useEffect` đồng bộ theo `current`, `role="tablist"` (`:73-99`), chỉ render `activePart.questions` (`:100`). Container trong là `mx-auto w-full max-w-[720px]` (`:63`).
- `apps/student/src/components/quiz/quiz-reading-layout.tsx`: navigator được truyền vào `<section aria-label="Bài làm">`, mỗi pane tự khoá `lg:h-[calc(100svh-3.5rem)]`.
- Caller: take (`apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:296`), review (`…/attempt/$attemptId.detail.tsx:121`), preview mô phỏng (`apps/web/src/components/assignments/preview-quiz-simulation.tsx:99,133`). Cả ba dùng chung component, nên sửa một nơi là áp cho cả ba.
- Test hiện có: `apps/student/test/quiz-navigator.test.tsx:53-63` (đề 1 phần không có tablist), `apps/student/test/quiz-reading-layout.test.tsx`, e2e `apps/e2e/specs/student-quiz-take-review.spec.ts:795-798` (assert `getByRole("tab", { name: "Questions 3–4" })`).

## Files
- Modify: `packages/ui/src/components/quiz/quiz-navigator.tsx`
- Modify: `apps/student/src/components/quiz/quiz-reading-layout.tsx`
- Modify: `apps/student/test/quiz-navigator.test.tsx`
- Modify: `apps/student/test/quiz-reading-layout.test.tsx`
- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts`
- Modify: `CHANGELOG.md` (thêm mục `## 2026-10-02` với `### Fixed`/`### Changed` theo quy ước đầu file CHANGELOG, ghi `(#303)`)

## Steps
1. Test unit trước (red):
   - Navigator với parts nhiều cụm (`buildQuizParts` trên đề có intro 2 section) không có `role="tablist"`/`role="tab"`, và có đủ `data-question` 0..N-1 theo thứ tự.
   - Không còn class `max-w-[720px]` trong markup navigator.
   - Reading layout: navigator render ngoài `section[aria-label="Bài làm"]` và là anh em của grid 2 pane.
2. `quiz-navigator.tsx`: xoá `activePartIndex`, `useEffect`, `safeActiveIndex`, khối tablist. Render `allQuestions.map(...)` với cùng logic nút hiện tại. Container trong đổi thành `w-full px-4 py-3`. Bỏ import `useEffect`/`useState` nếu không còn dùng. Cập nhật docstring.
3. `quiz-reading-layout.tsx`: wrapper `flex flex-1 flex-col lg:h-[calc(100svh-3.5rem)]`. Grid 2 pane `lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-2`, mỗi pane `lg:min-h-0 lg:overflow-y-auto` (bỏ chiều cao cố định riêng từng pane). **Giữ `data-testid="reading-work-pane"` trên chính phần tử cuộn** (div `overflow-y-auto` bên trong section Bài làm, như hiện tại ở `quiz-reading-layout.tsx:44`) vì e2e `student-quiz-take-review.spec.ts:713-741` đo `scrollTop` trên testid này; tương tự `reading-passage-pane` phải là phần tử cuộn của pane đọc. Navigator đặt sau grid nên trải full chiều ngang. Cập nhật docstring (navigator neo đáy toàn layout, không còn trong pane bài làm). Dưới lg giữ nguyên xếp chồng, footer sticky; giới hạn chiều cao navigator dưới lg bằng `max-h-[30svh] overflow-y-auto` để đề 40 câu ở 375px không chiếm gần nửa màn hình.
4. e2e:
   - Thay assert tab ở `:795-798` bằng assert không có tab và đủ nút số câu trong navigator.
   - Thêm case: prompt reading `type: "note"`, intro 2 section, 2 câu markerless có đáp án TRUE/NOT GIVEN + 2 câu `____`. Kỳ vọng `getByRole("radio", { name: "TRUE" })` hiển thị trong câu 1, chọn rồi nộp, review câu 1 là đúng. Navigator nằm ngoài pane "Bài làm" (bounding box rộng ≈ viewport).
5. Gate cuối (dev stack local chiếm 8000/8001/8003):
   - `pnpm check`
   - `pnpm check-types`
   - `pnpm --filter student test`, `pnpm --filter web test`, `pnpm --filter server test`
   - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- student-quiz-take-review`

## Verify
Tất cả lệnh gate xanh. Thủ công trên đề "Wooden buildings" ở ≥ lg: thanh navigator trải cả hai pane, 13 nút liền một dải, không có tab; câu 1–4 có radio.

## Risk / Rollback
Thay đổi layout thuần UI. Rủi ro là chiều cao pane ở lg bị tràn; mitigate bằng `min-h-0` trên grid và pane. Rollback bằng cách revert 2 component.
