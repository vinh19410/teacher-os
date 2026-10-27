---
phase: 3
title: "E2E AC-002"
status: completed
effort: 2h
---

# Phase 3 — E2E AC-002

## Files

- `apps/e2e/specs/ai-exam-import-ac-002.spec.ts` (tái dùng fixture `apps/e2e/fixtures/exam-import/cambridge-sample.pdf` của TOS-24; fake injector ở `apps/e2e/src/boot.ts:169` nên spec không phụ thuộc Workers AI).

## Steps

1. Upload fixture lần 1 → chờ đối chiếu 2 cột; ghi nhận số dư ví (25 Cr).
2. Quay lại màn `[6]` trống, upload lại cùng tệp → assert banner "Phát hiện tệp trùng…" (`role="status"`) + nút "Mở lại bản nháp cũ (0 Cr)"; số dư vẫn 25 Cr.
3. Bấm nút → cột phải hiển thị đúng bản nháp cũ.
4. Bypass lookup (red-team #7 — chứng minh lớp POST của D3): `page.route("**/api/exam-imports/lookup*", abort)` rồi upload lại cùng tệp → banner vẫn hiện (qua nhánh POST `{duplicateOf}`), ví vẫn 25 Cr, không có job mới.
5. Keyboard (AC phase-2): Tab tới nút banner → Enter kích hoạt → mở đúng job cũ.
6. 3 viewport (REVIEW.md): 1440×900 → 768×1024 → 375×812 quanh assert banner.

## Verify

- `pnpm --filter e2e e2e -- ai-exam-import-ac-002` pass với port override 8100/8101/8103/8104.
