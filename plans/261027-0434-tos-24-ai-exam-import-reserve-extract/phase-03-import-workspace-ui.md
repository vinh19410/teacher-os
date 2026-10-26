---
phase: 3
title: "Màn [6] Nhập đề AI: dropzone + đối chiếu 2 cột"
status: pending
effort: 8h
---

# Phase 3 — Màn `[6]` Nhập đề AI

## Mục tiêu

Màn `ai-exam-import-workspace` theo wireframe: huy hiệu chi phí/số dư, dropzone + tiến trình, đối chiếu 2 cột (read-only ở plan này), nhãn vàng câu cần rà soát.

## Files

- Tạo `apps/web/src/routes/_auth/assignments/tests/import.tsx` (+ `import.test.tsx`); search param `?job=<id>` để mở lại job.
- Tạo `apps/web/src/components/exam-import/` : `credit-cost-badge.tsx`, `exam-file-dropzone.tsx`, `source-document-viewer.tsx` (pdfjs-dist, lật trang, zoom 50–200%), `extracted-exam-panel.tsx`, `question-review-card.tsx`.
- `apps/web/src/routes/_auth/assignments/tests/new.tsx`: nút **"Nhập đề bằng AI (5 Credit)"** dẫn tới `/assignments/tests/import`.
- `apps/web/src/lib/repos/` : hàm gọi `POST /api/exam-imports`, `GET /api/exam-imports/:id`, `GET /api/credits/wallet`.
- `apps/web/package.json`: thêm `pdfjs-dist` (worker build qua Vite `?url`).

## Steps

1. Header: tiêu đề + `CreditCostBadge` ("Chi phí: 5 Credit (Tạm giữ) · Ví: N Cr").
2. Dropzone nhận `.pdf,.png,.jpg,.jpeg`; khi upload hiển thị tiến trình bất định kèm "Đang bóc tách (tối đa 120 giây)"; xong thì đẩy `?job=<id>` lên URL.
3. Layout: `lg:` grid 2 cột; `< lg` dùng `Tabs` ("Tài liệu gốc" | "Câu hỏi bóc tách") + sticky bottom bar.
4. Cột phải read-only: tên đề, kỹ năng, thời gian, passage (render rich text hiện có), danh sách câu; `QuestionReviewCard` có `Badge` vàng "(!) Cần rà soát lại" khi `needsReview`, viền warning; câu tin cậy cao có nhãn "Độ tin cậy cao".
5. Token màu/type theo `DESIGN.md` (`packages/ui/src/styles/globals.css`), không hard-code màu vàng ngoài token warning.

## Success criteria / Verify

- `pnpm --filter web test -- import` pass: render badge, 2 cột/tab theo viewport, nhãn vàng đúng số câu `needsReview`.
- Verify 3 viewport + focus bàn phím; screenshot đính kèm PR; `pnpm design:compare`.
