---
phase: 2
title: "Banner trùng đề + nút Mở lại bản nháp cũ (0 Cr)"
status: pending
effort: 3h
---

# Phase 2 — Banner trùng đề

## Files

- `apps/web/src/lib/file-fingerprint.ts` (+ test): `sha256Hex(file: File)`.
- `apps/web/src/components/exam-import/duplicate-exam-banner.tsx` (+ test).
- `apps/web/src/routes/_auth/assignments/tests/import.tsx`: gọi lookup trước upload, xử lý `duplicateOf` từ POST.

## Steps

1. Khi chọn tệp: tính `sha256Hex` → `GET /lookup`; trùng → hiện banner, **không** upload; không trùng → upload như TOS-24.
2. Response POST có `duplicateOf` (trường hợp client bỏ qua lookup) → hiện cùng banner.
3. Nút "Mở lại bản nháp cũ (0 Cr)" → `navigate({ search: { job } })`; banner biến mất khi mở job.
4. Banner có `role="status"`, nút focus được bằng bàn phím.

## Verify

- `pnpm --filter web test -- duplicate-exam-banner import` pass; 3 viewport.
