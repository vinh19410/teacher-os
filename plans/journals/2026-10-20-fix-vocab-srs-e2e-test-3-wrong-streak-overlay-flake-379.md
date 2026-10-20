---
title: "Fix vocab-srs e2e test 3 wrong-streak overlay flake (#379)"
date: 2026-10-20
summary: Gate wrong-streak overlay assertion by DOM verdict counter + fix post-dismiss continue deadlock
---

# Fix vocab-srs e2e test 3 wrong-streak overlay flake (#379)

## Bối cảnh & Triệu chứng
Full-file run `apps/e2e/specs/vocab-srs.spec.ts` thỉnh thoảng fail tại `expect(overlaySeen, "wrong-streak overlay appeared").toBe(true)` (ghi nhận 1/1 trong run gate #377 ngày 2026-10-20).

## Root Cause
1. Biến `safety` tăng ở mọi vòng lặp kể cả vòng `continue` chờ render — không tương quan với số lần trả lời sai liên tiếp (`wrongStreak` trong `packages/api/src/srs/review-session.ts:238-246`).
2. Khi shuffle chọn prompt `typing`, test điền đúng `"sustainable"` → engine reset `wrongStreak = 0` và kết thúc session (1 card due), trong khi `safety >= 5` vẫn thoả.
3. Red-team phát hiện thêm deadlock: `dismissEncouragement` chỉ tự-advance với `selfCheck` (`review-session.ts:321-327`); với `typing`/options, sau dismiss feedback panel vẫn mở và khóa input (`disabled:pointer-events-none`) làm vòng lặp treo chờ actionability.

## Giải pháp & Kiểm chứng
- Đọc verdict trực tiếp từ `vocab-feedback-verdict` (whitelist 3 chuỗi `"Chính xác" | "Chưa đúng" | "Chưa nhớ"`) trong feedback block chung, cộng dồn `wrongStreak`, reset khi `"Chính xác"` hoặc khi overlay xuất hiện, và chốt `overlayRequired` khi chạm 5.
- Trong nhánh overlay, sau khi dismiss click thêm `vocab-continue-btn` nếu visible để advance qua prompt typing/option.
- Thay gate `if (safety >= 5)` bằng hai assertion đối xứng: `if (overlayRequired) expect(overlaySeen).toBe(true)` và `if (overlaySeen) expect(overlayRequired).toBe(true)`.
- Kiểm chứng: `pnpm check`, `pnpm check-types`, `pnpm --filter student test` (304/304), và 5/5 run liên tiếp `playwright test vocab-srs` pass.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
