---
phase: 2
title: "Banner trùng đề + nút Mở lại bản nháp cũ (0 Cr)"
status: completed
effort: 3h
---

# Phase 2 — Banner trùng đề

## Files

- `apps/web/src/lib/file-fingerprint.ts` (+ test): `sha256Hex(file: File)` — feature-detect `crypto?.subtle`, vắng (non-secure context) → throw có kiểu để caller fail-open (red-team #6).
- `apps/web/src/lib/repos/exam-imports.ts`: `createExamImport` đổi trả union `{ kind: "created", job } | { kind: "duplicate", duplicate }` — parse body bằng `examImportCreateResponseSchema` (phân biệt `"duplicateOf" in body`), KHÔNG parse cứng job DTO (red-team #1); thêm `lookupExamImportByFingerprint(fingerprint)` gọi GET `/lookup` (throw cho caller xử lý fail-open).
- `apps/web/src/components/exam-import/duplicate-exam-banner.tsx` (+ test): `role="status"`, text D5 (title fallback), nút "Mở lại bản nháp cũ (0 Cr)" focus được bằng bàn phím.
- `apps/web/src/routes/_auth/assignments/tests/import.tsx`: gọi lookup trước upload (fail-open), xử lý `{ kind: "duplicate" }` từ cả lookup lẫn POST; guard job draft null.
- `apps/web/src/routes/_auth/assignments/tests/import.test.tsx`: bổ sung hàm lookup + `file-fingerprint` vào mock (factory mock full-module hiện tại sẽ nổ TypeError với hàm mới — red-team #10).

## Steps

1. Khi chọn tệp: bọc **try/catch riêng** quanh hash + lookup (fail-open — red-team #6): hash/lookup lỗi bất kỳ (kể cả `crypto.subtle` vắng) → log + upload thẳng như TOS-24. Trùng → hiện banner, **không** upload; không trùng → upload như TOS-24.
2. Response POST `{ kind: "duplicate" }` (client bỏ qua lookup/lỗi lookup/race) → hiện cùng banner (red-team #1).
3. Nút "Mở lại bản nháp cũ (0 Cr)" → `navigate({ search: { job } })`; banner biến mất khi mở job.
4. Guard job draft null (red-team #9): `phase === "done"` mà `job.draft == null` → ErrorNotice "Bản nháp hỏng hoặc không đọc được — hãy nhập đề mới" + trả lại dropzone (không màn trắng dead-end).

## Verify

- `pnpm --filter web test -- duplicate-exam-banner import` pass (jsdom stub `crypto.subtle` trong test fingerprint); 3 viewport 1440×900 / 768×1024 / 375×812 + focus bàn phím theo `REVIEW.md`.
