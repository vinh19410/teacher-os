---
phase: 2
title: "Admin: overlay Xem trước + nút trên toolbar"
status: pending
priority: P2
effort: "0.5-0.75d"
dependsOn: [1]
---

# Phase 2 — Overlay Xem trước trong trang soạn đề

## Mục tiêu

Nút **Xem trước** trên toolbar trang soạn mở overlay toàn màn hình render bộ đề theo giao diện học viên, dùng dữ liệu đã lưu + bản nháp; làm thử được, không lưu.

## File sở hữu

| File | Hành động |
|---|---|
| `apps/admin/src/components/library/test-preview-model.ts` | tạo — `buildTestPreview({ skill, slots, partsBySlot, drafts, savedInputs })` trả danh sách tab part: `{ part, label, view \| null, usedSavedFallback }` với `qOffset` theo fold toàn đề |
| `apps/admin/src/components/library/test-preview-model.test.ts` | tạo |
| `apps/admin/src/components/library/test-preview-overlay.tsx` | tạo — UI overlay |
| `apps/admin/src/components/library/test-preview-overlay.test.tsx` | tạo |
| `apps/admin/src/routes/_auth/library/tests/$testId.tsx` | sửa — nút toolbar + state `previewOpen` + mount overlay |

## Tham chiếu UI

- Preview giáo viên `apps/web/src/components/assignments/preview-quiz-simulation.tsx` (#285): cách ghép `QuizPaper` + `QuizNavigator` + dòng "Bản mô phỏng — bài làm không được lưu." Overlay admin theo cùng bố cục phần take (không có nút nộp/review theo D3).

## Dữ liệu

- Tái dùng logic của `effectivePartsFor` (draft dirty và parse OK → draft; ngược lại → bản đã lưu) nhưng cần biết part nào **rơi về bản lưu vì draft hỏng** → hoặc mở rộng `effectivePartsFor` trả thêm thông tin, hoặc `buildTestPreview` tự gọi `partInputFromValue`. Không nhân đôi luật chọn draft/saved: tách helper dùng chung nếu cần.
- `qOffset` của mỗi part = tổng số câu của các part đứng trước theo thứ tự preset — phải khớp `sections[].qStart` của `buildTestOutline` (test đối chiếu).
- Tính bằng `useMemo` trên `deferredDrafts`, chỉ khi overlay đang mở.

## UI overlay

- Container `fixed inset-0 z-50 flex flex-col bg-muted/30`, `role="dialog"`, `aria-modal="true"`, `aria-label="Xem trước bộ đề <title>"`. Admin không có thư viện dialog — theo precedent `apps/admin/src/components/library/delete-test-dialog.tsx`: Esc bắt ở `document`, focus nút đầu khi mở; bổ sung trả focus về nút Xem trước khi đóng và giữ Tab trong overlay.
- Header cao `h-14` (giữ phép tính `100svh - 3.5rem` của split-pane): tiêu đề đề, nhãn "Xem trước", nút **Đóng**.
- Banner ngay dưới header: "Bản xem trước — học viên sẽ thấy giao diện này. Đáp án bạn chọn không được lưu." + cảnh báo part dùng bản đã lưu do bản nháp lỗi + ghi chú cờ nhóm chưa hỗ trợ (D7).
- Thanh tab part (`role="tablist"`, phím mũi tên chuyển tab). Nếu banner/tab làm tổng chiều cao trên vượt `3.5rem`, truyền offset vào `QuizReadingSplitLayout` (thêm prop tùy chọn ở phase 1 nếu cần) thay vì để pane bị tràn.
- Nội dung tab: `skill === "reading"` và passage không rỗng → `QuizReadingSplitLayout` + `QuizPaper hidePassage`; còn lại 1 cột `max-w-[720px]` như học viên. Navigator: `QuizNavigator` với parts của tab.
- Part chưa có nội dung: trạng thái rỗng "Part này chưa có nội dung".
- Answers: `useState<Record<number,string>>` trong overlay; reset khi overlay unmount.
- Không gọi `useBlocker`, không mutation, không fetch mới.

## Trang soạn

- Nút `Xem trước` (icon `Eye`, variant outline, size sm) đặt cạnh "Kiểm tra đáp án". Luôn bật khi `detail` đã tải.
- Mở overlay mặc định tab = `currentSlot`.
- Khi overlay mở, khóa cuộn body.

## Các bước

1. Test-first cho `buildTestPreview`: draft hợp lệ được ưu tiên, draft hỏng rơi về saved + cờ, slot trống → `view: null`, `qOffset` khớp outline.
2. Hiện thực model.
3. Overlay + test component (Testing Library): mở/đóng, Esc, focus trả về nút, chuyển tab, gõ đáp án không gọi fetch (mock `fetch` assert 0 lần), DOM không chứa chuỗi đáp án của fixture.
4. Gắn vào route.

## Verify

```bash
pnpm --filter admin test
pnpm check-types
pnpm check
```

Thủ công: dev stack (`localhost:8004`), mở một bộ đề Reading và một Listening, kiểm tra split-pane, nhóm câu, option bank, pin.

## Rủi ro / rollback

- Overlay chỉ thêm UI, không đụng dữ liệu → rollback bằng revert.
