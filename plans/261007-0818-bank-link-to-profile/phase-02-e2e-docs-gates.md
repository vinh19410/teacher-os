---
title: "Phase 2: E2E + docs + gate cuối"
status: todo
effort: "1h"
dependencies: [1]
---

# Phase 2: E2E + docs + gate cuối

## Overview

**Priority:** P2 · **Status:** todo

Trỏ e2e flow liên kết ngân hàng sang `/profile`, chạy bộ spec bị ảnh hưởng, verify UI 3 viewport, và cập nhật tài liệu (CHANGELOG entry mới, runbook smoke step). Kết thúc bằng bộ lệnh gate local theo AGENTS.md.

## Context Links

- E2E hiện tại: [tuition-bank-transfer.spec.ts:140](../../apps/e2e/specs/tuition-bank-transfer.spec.ts) (`goto ${WEB_ORIGIN}/payments`)
- Spec trang đích: [profile.spec.ts](../../apps/e2e/specs/profile.spec.ts) (6 test, trong đó nhánh `?error=` OAuth assert `toHaveURL(/\/profile$/)`)
- Runbook cần sửa: [production-release-runbook.md:771-773](../../docs/production-release-runbook.md) (smoke step "từ trang 'Nhận học phí' (`/payments`)")

## Key Insights

- Text assertion của e2e #320 ("Nhận học phí qua chuyển khoản", "Liên kết tài khoản ngân hàng", "Đã liên kết", "•••6789") theo **component** nên giữ nguyên sau khi đổi URL goto.
- Local dev stack chiếm 8000/8001/8003 → e2e chạy với override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103` (AGENTS.md).
- Spec `tuition-bank-transfer` dùng `test.describe.configure({ mode: "serial" })` — test đầu tạo teacher mới (`signUpViaUi`) rồi link bank; đổi goto không đụng seed state.
- CHANGELOG là nhật ký theo ngày: **thêm entry mới**, không sửa entry 2026-10-06 của #320.

## Requirements

- [ ] E2E liên kết ngân hàng chạy thành công từ `/profile`.
- [ ] `profile.spec.ts` vẫn pass (nhánh OAuth error không vỡ bởi card mới).
- [ ] UI 3 viewport không tràn/đứt layout, screenshot kèm PR.
- [ ] Docs phản ánh đúng trang mới; CHANGELOG có entry Changed của ngày chạy.

## Implementation Steps

1. **`apps/e2e/specs/tuition-bank-transfer.spec.ts`** — L140: `await page.goto(`${WEB_ORIGIN}/payments`)` → `${WEB_ORIGIN}/profile`. Giữ nguyên toàn bộ assertion.
2. **Chạy 2 spec bị ảnh hưởng** (dev stack local đang chạy):
   ```sh
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 \
     pnpm --filter e2e exec playwright test specs/tuition-bank-transfer.spec.ts specs/profile.spec.ts
   ```
3. **Verify UI 3 viewport** (1440×900, 768×1024, 375×812) trên `/profile`: 4 card xếp dọc không tràn ngang, focus-visible ring trên nút "Liên kết tài khoản ngân hàng"/"Huỷ liên kết" theo REVIEW.md; chụp screenshot kèm PR.
4. **`docs/production-release-runbook.md`** — smoke sau bật (khoảng L771-773): "liên kết 1 tài khoản sandbox/production từ trang 'Nhận học phí' (`/payments`)" → "…từ trang Hồ sơ (`/profile`)".
5. **`CHANGELOG.md`** — thêm dưới mục `## 2026-10-07` (ngày chạy), nhóm `### Changed`:
   `- Liên kết tài khoản ngân hàng (SePay Bank Hub) chuyển từ trang riêng /payments vào trang Hồ sơ /profile (card "Nhận học phí qua chuyển khoản"); gỡ mục "Nhận học phí" khỏi sidebar (#<issue>)`
6. **Gate cuối theo AGENTS.md:** `pnpm check` → `pnpm check-types` → `pnpm --filter web test` → e2e như bước 2 (full suite `pnpm --filter e2e e2e` nếu thời gian cho phép).

## Todo

- [ ] e2e tuition-bank-transfer: goto /profile
- [ ] Chạy specs tuition-bank-transfer + profile (port override 8100/8101/8103)
- [ ] Screenshot 3 viewport /profile
- [ ] Runbook: smoke step → /profile
- [ ] CHANGELOG: entry Changed mới + số issue
- [ ] Gate cuối pass

## Success Criteria

- Cả 2 spec e2e pass; screenshot 3 viewport sạch (không tràn ngang, thứ tự card đúng).
- CHANGELOG + runbook đã cập nhật; không còn tham chiếu ops/docs tới web route `/payments`.
- Bộ gate local pass đủ.

## Risk Assessment

- Spec `profile` chạy chung serial suite với spec #320: test "teacher links a bank account" tạo teacher riêng (`Date.now()` email) nên không xung đột dữ liệu; panel trên profile của các test khác chỉ ở trạng thái "Chưa bật"/"Liên kết" — không assert nên vô hại.
- Nếu Bank Hub sandbox thay đổi hosted link → test #320 fail nguyên nhân ngoài (đã có playbook ghi ở report sandbox #320).

## Security Considerations

- Screenshot chỉ chụp `/profile` của user test e2e (dữ liệu seed) — không có dữ liệu thật.
- Không đưa secret/env vào CHANGELOG hay runbook mới.

## Next Steps

- PR vào `develop` (không có CI checks — gate là bộ lệnh local); issue giữ mở nếu cần follow-up CTA từ `/tuition`.
