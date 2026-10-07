---
title: "Chuyển liên kết tài khoản ngân hàng từ /payments vào /profile"
description: "Panel liên kết ngân hàng SePay Bank Hub (#320) rời trang riêng /payments về trang Hồ sơ /profile; gỡ route /payments và nav sidebar 'Nhận học phí', cập nhật matcher/test/e2e/docs theo."
status: pending
priority: P2
effort: "2h"
issue: 338
branch: develop
tags: [refactor, frontend]
blockedBy: []
blocks: []
created: 2026-10-07
---

# Chuyển liên kết tài khoản ngân hàng từ /payments vào /profile

## Overview

Tính năng "Nhận học phí qua VietQR" (#320) hiện có đúng một điểm vào trên web giáo viên: trang riêng `/payments` ([payments.tsx](../../apps/web/src/routes/_auth/payments.tsx)) chứa duy nhất `<BankLinkPanel />`, kèm mục sidebar "Nhận học phí". Plan này dời panel đó vào trang Hồ sơ `/profile` — nơi đã có pattern stack Card dọc (`ProfileForm` → `AvatarSection` → `GoogleLinkCard`) — rồi gỡ sạch route `/payments`, mục sidebar, và cập nhật matcher/unit test/e2e/docs theo.

Không đụng gì xuống dưới panel: API `/api/bank-link*`, client `lib/repos/bank-link.ts`, modal `BankHubLinkModal`, CSP `frame-src` SePay, trang công khai `/pay/<token>` và app học viên giữ nguyên. Trạng thái panel (chưa bật / chưa liên kết / inactive / đã liên kết) giữ nguyên 100%.

```text
TRƯỚC                                          SAU
sidebar: … Học phí | Nhận học phí | Bài tập …  sidebar: … Học phí | Bài tập …
                                               (đường vào: avatar → Hồ sơ)

/payments          /profile                    /payments (404 — path lạ)
┌──────────────┐   ┌──────────────────────┐    /profile
│ Nhận học phí │   │ Thông tin cá nhân    │    ┌──────────────────────┐
│──────────────│   │──────────────────────│    │ Thông tin cá nhân    │
│ Nhận học phí │   │ Ảnh đại diện         │    │──────────────────────│
│ qua chuyển   │   │──────────────────────│    │ Ảnh đại diện         │
│ khoản        │   │ Google               │    │──────────────────────│
│ [Liên kết…]  │   │──────────────────────│    │ Google               │
└──────────────┘   └──────────────────────┘    │──────────────────────│
                                               │ Nhận học phí qua     │
                                               │ chuyển khoản         │
                                               │ [Liên kết…]          │
                                               └──────────────────────┘
```

## Key Decisions

1. **Gỡ hẳn route `/payments`, không redirect.** Theo precedent gỡ `/settings` (#321, plan `261005-1523`): route bị xoá, matcher xử lý `/payments` như path lạ. Lý do chấp nhận: tính năng mới ship 2026-10-06, đang beta tắt mặc định (secret rỗng), và URL không nằm trong email/QR nào (QR trỏ `/pay/<token>`) nên thực tế không có deep-link người dùng nào trỏ `/payments`.
2. **`BankLinkPanel` giữ nguyên file `components/payments/bank-link-panel.tsx`.** Domain bank-link vẫn thuộc payments logic; `bank-hub-link-modal.tsx` đang import type `BankLinkPurpose` từ panel, và unit test import theo path cũ. Chỉ đổi chỗ render — tránh churn import không có lợi ích.
3. **Vị trí trên `/profile`: cuối stack, sau `GoogleLinkCard`** — hai card "liên kết tài khoản" (Google, ngân hàng) nằm liền nhau. `PageHead` lead của `/profile` cập nhật liệt kê thêm tài khoản ngân hàng.
4. **Không đụng nhánh lỗi OAuth của `/profile`**: `validateSearch ?error=` và effect toast/navigate replace (profile.tsx L24-53) không liên quan panel — modal bank dùng postMessage, không thêm search param mới.
5. **Matcher + regression test kiểu precedent `/settings`**: gỡ `"/payments": true` khỏi `VALID_EXACT_ROUTES`, thêm assert `isValidAppRoute("/payments") === false` vào test "rejects random unknown paths".
6. **Docs: chỉ thêm, không sửa lịch sử.** CHANGELOG thêm entry mới dưới `## 2026-10-07 ### Changed` (entry 2026-10-06 của #320 giữ nguyên); runbook production smoke step đổi tham chiếu trang `/payments` → `/profile`.

## Non-Goals

- Không đổi API server (`apps/server/src/routes/bank-link.ts`), client repo (`lib/repos/bank-link.ts`), CSP, feature flag bằng secret-blank.
- Không đổi UI/state machine của `BankLinkPanel`, không thêm search param để mở modal từ URL.
- Không thêm CTA "liên kết ngân hàng" từ `/tuition` hay `InvoicePaymentModal` (gap discoverability ghi ở Risk — cần quyết định sản phẩm riêng).
- Không redirect `/payments` → `/profile`.
- Không đổi app học viên, `/pay/<token>`, `UnmatchedTransactions` (trang `/tuition`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Dời BankLinkPanel vào /profile, gỡ route /payments](./phase-01-move-bank-link-to-profile.md) | Pending |
| 2 | [E2E + docs + gate cuối](./phase-02-e2e-docs-gates.md) | Pending |

Chạy tuần tự 1 → 2. Phase 2 chỉ chạy khi Phase 1 đã pass unit + check-types.

## Success Criteria

- [ ] `/profile` hiển thị Card "Nhận học phí qua chuyển khoản" sau Google, đủ 4 trạng thái panel (chưa bật / liên kết / khôi phục / huỷ liên kết) — kiểm chứng bằng e2e liên kết thành công từ `/profile`.
- [ ] `/payments` hết tồn tại: không còn file route, `routeTree.gen.ts` không còn route (regen bằng tool, không sửa tay), `isValidAppRoute("/payments") === false`, sidebar không còn mục "Nhận học phí".
- [ ] E2E `tuition-bank-transfer.spec.ts` (goto `/profile`) và `profile.spec.ts` (nhánh `?error=` OAuth không vỡ) pass.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test` pass.
- [ ] UI verify 3 viewport (1440×900, 768×1024, 375×812) theo REVIEW.md, screenshot kèm PR.
- [ ] CHANGELOG (entry mới 2026-10-07) và `docs/production-release-runbook.md` (smoke step) cập nhật theo trang mới.

## Risk

- **Discoverability giảm**: nav "Nhận học phí" là đường vào duy nhất của tính năng; sau move, đường vào duy nhất là avatar → Hồ sơ. Chấp nhận theo yêu cầu; nếu cần, follow-up riêng: CTA từ `/tuition` khi `enabled=false`/`none`.
- **Mỗi lần mở `/profile` thêm 1 request** `GET /api/bank-link` (503 `BANK_LINK_DISABLED` khi feature off → panel "Chưa bật"). Các test `profile.spec.ts` không assert text lead trang nên không vỡ.
