---
phase: 2
title: "Cột phải chỉnh sửa + cổng xác nhận"
status: pending
effort: 7h
---

# Phase 2 — Cột phải chỉnh sửa + cổng xác nhận

## Files

- `apps/web/src/components/exam-import/extracted-exam-panel.tsx`, `question-review-card.tsx`: chuyển sang form chỉnh sửa.
- Tạo `apps/web/src/components/exam-import/review-confirmation.tsx` (+ test), `exam-import-actions.tsx` (sticky bar < 1024px).
- `apps/web/src/lib/repos/`: `saveExamImportDraft`, `publishExamImport`.

## Steps

1. Form theo D7 của plan; giữ nhãn vàng + viền warning trên câu `needsReview` kể cả sau khi sửa.
2. `ReviewConfirmation`: chỉ render khi `reviewCount > 0`; label "Tôi đã kiểm tra và xác nhận <N> câu gắn nhãn Cần rà soát lại".
3. "Lưu bản nháp" luôn bật (trừ khi đang lưu); "Lưu vào Ngân hàng đề" `disabled` khi `reviewCount > 0 && !confirmed`, có `aria-describedby` giải thích.
4. Publish 422 → toast lỗi đúng mã; thành công → toast + điều hướng `/assignments/tests/<id>`.

## Verify

- `pnpm --filter web test -- review-confirmation extracted-exam import` pass: nút khóa/mở theo checkbox, không render checkbox khi 0 câu nhãn.
- 3 viewport + focus; screenshot vào PR.
