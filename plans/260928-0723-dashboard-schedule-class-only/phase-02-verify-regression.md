---
phase: 2
title: "Kiểm chứng & regression"
status: pending
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Kiểm chứng & regression

## Goal

Chứng minh thay đổi không vỡ: typecheck, lint, unit, và các e2e phủ dashboard + flow check-in.

## Files to Create / Modify

- Không sửa file nguồn ngoài những gì phase 1 đã sửa. Chỉ chạy kiểm chứng (nếu e2e fail do UI đổi, cập nhật đúng spec liên quan — phân tích hiện tại cho thấy không spec nào phụ thuộc student list trên dashboard).

## Key Insights

- Playwright config (`apps/e2e/playwright.config.ts`) tự boot API + web qua `webServer` → chạy spec trực tiếp không cần bật server tay.
- Các spec check-in thao tác trên class detail + /schedule modal, không đụng dashboard → kỳ vọng pass không cần sửa.
- `account-role-separation.spec.ts` goto /dashboard nhưng chỉ assert blocked-view text → không ảnh hưởng.

## Tasks & Steps

1. `pnpm check` — biome sạch (không unused import).
2. `pnpm --filter web check-types` — tsc sạch.
3. `pnpm --filter web test` — bao gồm `kernel-runtime.contract.test.ts` (đã sửa ở phase 1 sang negative pin dashboard) và `dashboard-from-kernel.test.ts` (helper không đổi, kỳ vọng xanh nguyên).
4. `pnpm --filter e2e e2e specs/login.smoke.spec.ts specs/account-role-separation.spec.ts` — phủ dashboard surface.
5. `pnpm --filter e2e e2e specs/class-operations.spec.ts specs/schedule-session-modal.spec.ts specs/projected-sessions.spec.ts` — chứng minh check-in còn nguyên ở class detail + /schedule.
6. Nếu mọi thứ xanh: chạy `ak plan check` cho các phase và đóng plan theo quy trình.

## Todo List

- [x] pnpm check sạch
- [x] pnpm --filter web check-types pass
- [x] pnpm --filter web test pass
- [x] E2e dashboard smoke pass
- [x] E2e check-in flow pass

## Verification

- Tất cả lệnh trên exit 0.

## Risk Assessment

- Nếu một spec nào thực sự assert student list trên dashboard (phân tích cho thấy không có), cập nhật spec đó trong phase này — giữ nguyên ý test, bỏ assertion về học viên.

## Security Considerations

- Không có.

## Next Steps

- Commit theo conventional commit: `refactor(web): dashboard schedule cards hiển thị gọn chỉ lớp`.
