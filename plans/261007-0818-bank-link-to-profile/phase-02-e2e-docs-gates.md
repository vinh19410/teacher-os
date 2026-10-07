---
title: "Phase 2: E2E + docs + gate cuối"
status: done
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

- [x] E2E liên kết ngân hàng chạy thành công từ `/profile`.
- [x] `profile.spec.ts` vẫn pass (nhánh OAuth error không vỡ bởi card mới).
- [x] `404-branded-status.spec.ts` assert `/payments` → HTTP 404.
- [x] UI 3 viewport không tràn/đứt layout, screenshot kèm PR.
- [x] Docs phản ánh đúng trang mới; CHANGELOG có entry Removed của ngày chạy.

## Implementation Steps

1. **`apps/e2e/specs/tuition-bank-transfer.spec.ts`** — L140: `await page.goto(`${WEB_ORIGIN}/payments`)` → `${WEB_ORIGIN}/profile`. Giữ nguyên toàn bộ assertion.
2. **`apps/e2e/specs/404-branded-status.spec.ts`** (red-team SA-1): thêm `"/payments"` vào loop unknown-paths (pattern có sẵn cho `/help`, `/about`,…) — assert HTTP 404 + branded UI cho route đã gỡ, chứng minh 404 thật ở tầng serve.
3. **Chạy 3 spec bị ảnh hưởng** (dev stack local đang chạy):
   ```sh
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 \
     pnpm --filter e2e exec playwright test specs/tuition-bank-transfer.spec.ts specs/profile.spec.ts specs/404-branded-status.spec.ts
   ```
4. **Verify UI 3 viewport** (1440×900, 768×1024, 375×812) trên `/profile`: 4 card xếp dọc không tràn ngang, token màu/spacing theo `DESIGN.md`, focus-visible ring trên nút "Liên kết tài khoản ngân hàng"/"Huỷ liên kết" theo REVIEW.md; chụp screenshot kèm PR.
5. **`docs/production-release-runbook.md`** — smoke sau bật (khoảng L771-773): "liên kết 1 tài khoản sandbox/production từ trang 'Nhận học phí' (`/payments`)" → "…từ trang Hồ sơ (`/profile`)".
6. **`CHANGELOG.md`** — thêm dưới mục `## 2026-10-07` (ngày chạy), nhóm `### Removed` (red-team AD-4: gỡ route + nav đúng định nghĩa Removed theo quy ước của file):
   `- Gỡ trang riêng /payments và mục sidebar "Nhận học phí" — liên kết tài khoản ngân hàng (SePay Bank Hub) chuyển vào trang Hồ sơ /profile (card "Nhận học phí qua chuyển khoản") (#<issue>)`
7. **Gate cuối theo AGENTS.md:** `pnpm check` → `pnpm check-types` → `pnpm --filter web test` → **full suite `pnpm --filter e2e e2e` (bắt buộc — red-team AD-6: PR vào develop không có CI checks, full suite là mạng an toàn cuối; `workers: 1` nên một lần chạy là khả thi)**.

## Todo

- [x] e2e tuition-bank-transfer: goto /profile
- [x] e2e 404-branded-status: thêm "/payments" vào unknown-paths
- [x] Chạy specs tuition-bank-transfer + profile + 404-branded-status (port override 8100/8101/8103)
- [x] Screenshot 3 viewport /profile
- [x] Runbook: smoke step → /profile
- [x] CHANGELOG: entry Removed mới + số issue
- [x] Gate cuối pass, gồm full e2e suite `pnpm --filter e2e e2e`

## Success Criteria

- Cả 3 spec e2e pass; screenshot 3 viewport sạch (không tràn ngang, thứ tự card đúng).
- CHANGELOG + runbook đã cập nhật; không còn tham chiếu ops/docs tới web route `/payments`.
- Bộ gate local pass đủ, gồm full e2e suite.

## Risk Assessment

- **Tuần tự hoá liên-file nhờ `workers: 1` cứng trong `playwright.config.ts:16` (red-team SA-6/AD claims: `test.describe.configure({ mode: "serial" })` chỉ scope trong file `tuition-bank-transfer.spec.ts`, không phải cơ chế liên-file)**: test "teacher links a bank account" tạo teacher riêng (email `Date.now()`) nên không xung đột dữ liệu. Assumption đang giữ: nếu sau này tăng workers/`fullyParallel`, phải re-evaluate.
- **Trong e2e, panel trên `/profile` KHÔNG ở trạng thái "Chưa bật" (red-team AD-1)**: boot API wire fake Bank Hub unconditional (`apps/e2e/src/boot.ts:102,112`) → `GET /api/bank-link` trả `enabled: true, status: "none"` — panel render trạng thái bật với nút "Liên kết tài khoản ngân hàng" sống trên mọi test của `profile.spec.ts`. Các test này vẫn pass vì không assert panel bank và không collision locator (Google card dùng "Đã kết nối", panel dùng "Đã liên kết"; button name "Kết nối Google" unique). Không thêm assertion text/strict-mode mới trên `/profile` mà không tính tới panel đang live.
- Nếu Bank Hub sandbox thay đổi hosted link → test #320 fail nguyên nhân ngoài (đã có playbook ghi ở report sandbox #320).

## Security Considerations

- Screenshot chỉ chụp `/profile` của user test e2e (dữ liệu seed) — không có dữ liệu thật.
- Không đưa secret/env vào CHANGELOG hay runbook mới.

## Next Steps

- PR vào `develop` (không có CI checks — gate là bộ lệnh local); issue giữ mở nếu cần follow-up CTA từ `/tuition`.
