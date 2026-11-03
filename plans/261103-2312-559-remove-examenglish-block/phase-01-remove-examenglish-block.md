# Phase 01 — Xoá khối ExamEnglish

## Context

Xem [plan.md](plan.md). Khối được thêm ở #506 như ô tuỳ chọn; nay bỏ hẳn.

## Files

- Sửa: `apps/profile/public/index.html`
- Không sửa: output build của `apps/profile`, plan/journal cũ.

## Steps

1. Xoá CSS `.examenglish-details`, `.examenglish-details summary`, `.examenglish-body`, `.examenglish-body a` (quanh dòng 1445–1470).
2. Xoá `<details id="examEnglishDetails">…</details>` (quanh dòng 2835–2847).
3. JS: xoá `const examEnglishInput`; trong `getCombinedPlacement()` chỉ giữ `quizPlacementInput` (có thể đổi tên thành `getPlacement()` và cập nhật 3 chỗ gọi); xoá `examEnglish` trong `saveDraft()` và dòng restore trong `restoreDraft()`. Draft cũ còn key `examEnglish` thì bị bỏ qua, không lỗi.
4. `grep -i examenglish apps/profile/public/index.html` phải rỗng.

## Validation

- `pnpm --filter profile test`
- `pnpm exec biome check .`
- Mở form ở 3 viewport (1440×900, 768×1024, 375×812): không còn khối, layout không vỡ, gửi thử thành công, console sạch.

## Risk / Rollback

- Rủi ro thấp: sót tham chiếu `examEnglishInput` gây `TypeError` làm hỏng cả script form — grep ở bước 4 chặn lỗi này.
- Rollback: revert một commit.
