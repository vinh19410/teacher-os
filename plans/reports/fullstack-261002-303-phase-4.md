# Báo cáo phase 4 — navigator phẳng full-width (#303)

Status: DONE_WITH_CONCERNS (e2e chưa chạy theo yêu cầu).

## File đã sửa
- `packages/ui/src/components/quiz/quiz-navigator.tsx`: bỏ `activePartIndex`, `useEffect`, tablist; render toàn bộ `allQuestions` theo thứ tự; bỏ `max-w-[720px]`/`mx-auto`; footer `max-h-[30svh] overflow-y-auto lg:max-h-none lg:overflow-visible`.
- `apps/student/src/components/quiz/quiz-reading-layout.tsx`: wrapper `lg:h-[calc(100svh-3.5rem)]`, grid 2 pane (`lg:min-h-0 lg:flex-1 lg:grid-cols-2`), navigator là anh em của grid (ngoài section "Bài làm"). `reading-passage-pane` và `reading-work-pane` vẫn nằm trên phần tử `lg:overflow-y-auto`.
- `apps/student/test/quiz-navigator.test.tsx`, `apps/student/test/quiz-reading-layout.test.tsx`: test red trước (3 fail), sau đó xanh.
- `apps/e2e/specs/student-quiz-take-review.spec.ts`: thay assert tab bằng assert không có tab + đủ 4 nút; thêm prompt seed cuối mảng (note, intro 2 section, 2 câu markerless TRUE/NOT GIVEN + 2 câu `____`) và test mới (radio hiển thị, navigator ngoài pane "Bài làm" và rộng bằng viewport, chọn + nộp, review câu 1 đúng).
- `CHANGELOG.md`: mục `## 2026-10-02` (Fixed/Changed, `(#303)`).

## Kiểm tra
- `pnpm --filter student test`: 158/158 pass. `pnpm check-types`: 7/7 pass. `pnpm check`: không sửa gì, chỉ có info deprecated có sẵn của biome.json.
- e2e KHÔNG chạy (theo yêu cầu). Test e2e mới phụ thuộc phase 1–3.
- Preview mô phỏng `apps/web/src/components/assignments/preview-quiz-simulation.tsx` chỉ đọc: dùng `QuizNavigator` với cùng props, không phụ thuộc tab; không cần sửa.

## Lệch nhỏ so với plan
- Thêm `lg:flex-none` trên wrapper và `lg:grid-rows-[minmax(0,1fr)]` trên grid để chiều cao khoá ở lg xác định chắc chắn (flex-basis 0 của `flex-1` sẽ lấn át `lg:h-[...]`; hàng grid ngầm định `auto` có thể tràn). Cần e2e (đo `scrollTop` hai pane) xác nhận.
- CHANGELOG có thêm dòng Changed mô tả cảnh báo/nút 1-click ở answer-key grid (thuộc phase 3) để đủ phạm vi issue; controller nên đối chiếu lại với kết quả phase 3.

## Câu hỏi còn mở
- Cần chạy e2e `student-quiz-take-review` sau khi gộp phase 1–3 (kiểm tra cả cuộn độc lập 2 pane và test mới).
