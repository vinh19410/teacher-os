---
phase: 1
title: "Ghi chú inline trong EssayWithHighlights"
status: pending
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Ghi chú inline trong `EssayWithHighlights`

## Goal

Thêm prop opt-in `inlineNotes` cho component dùng chung để render ghi chú ngay sau mỗi highlight có ghi chú, không đổi gì khi prop tắt (trang chấm giáo viên).

## Files to Create / Modify

- Modify: `packages/ui/src/components/quiz/essay-with-highlights.tsx`
- Modify: `apps/web/src/components/ui/essay-with-highlights.test.tsx` (test component `packages/ui` chạy ở đây vì `packages/ui` không có script test)

## Tasks & Steps

1. Thêm prop `inlineNotes?: boolean` (mặc định `false`) với doc comment: student bật để hiện ghi chú sau highlight; **không bật ở essay bôi đen được** vì span ghi chú không mang `data-start`, sẽ làm sai phép ánh xạ vùng chọn → offset. Cập nhật doc comment đầu component cho khớp (bất biến "một text node mỗi phần tử" chỉ đúng khi `inlineNotes` tắt).
2. Trong nhánh highlight, bọc `<mark>` và ghi chú trong `<Fragment key={seg.annotation.id}>` (chuyển `key` từ `mark` ra Fragment). Nếu `inlineNotes && seg.annotation.note !== ""`, render ngay sau mark:
   ```tsx
   <span
     data-testid="essay-inline-note"
     data-annotation-id={seg.annotation.id}
     className="mx-1 box-decoration-clone rounded-sm border-warn border-l-2 bg-surface px-1.5 py-0.5 text-fg-2 text-sm"
   >
     <span className="sr-only">Ghi chú {seg.n}: </span>
     {seg.annotation.note}
   </span>
   ```
   Ghi chú render qua JSX text node (không `dangerouslySetInnerHTML`). Container vẫn `whitespace-pre-wrap`, nên xuống dòng trong ghi chú được giữ; `box-decoration-clone` giữ nền/viền cho từng dòng khi ghi chú bị ngắt dòng.
3. Không đổi `segmentEssay`, `markProps`, `activeId`, class của `mark`.

## Tests (thêm vào `essay-with-highlights.test.tsx`)

- Mặc định (không truyền `inlineNotes`) với annotation có ghi chú: không có `[data-testid="essay-inline-note"]`, `container.textContent === ESSAY` (bảo vệ bất biến trang chấm).
- `inlineNotes` + 2 annotation (một có ghi chú, một rỗng): đúng 1 `essay-inline-note`; phần tử liền sau `mark[data-n]` có ghi chú là span ghi chú (`mark.nextElementSibling?.dataset.testid === "essay-inline-note"`); mark có ghi chú rỗng không có span theo sau.
- Span ghi chú chứa `sr-only` "Ghi chú 1: " và text ghi chú.
- Ghi chú `"<b>x</b>"` render dạng text: `container.querySelector("b") === null`, textContent chứa `<b>x</b>`.

## Verification

- `pnpm --filter web test -- essay-with-highlights` xanh.
- `pnpm check-types` xanh.

## Risks

- Đổi `key` từ `mark` sang Fragment: React vẫn dùng `annotation.id` làm key, không ảnh hưởng tái sử dụng DOM ở trang chấm (focus/popover). Test hiện có của `annotatable-essay.test.tsx` phải giữ xanh: `pnpm --filter web test -- annotatable-essay`.
