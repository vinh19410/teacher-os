---
title: "Chuyển liên kết tài khoản ngân hàng từ /payments vào /profile"
description: "Panel liên kết ngân hàng SePay Bank Hub (#320) rời trang riêng /payments về trang Hồ sơ /profile; gỡ route /payments và nav sidebar 'Nhận học phí', cập nhật matcher/test/e2e/docs theo."
status: completed
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
3. **Vị trí trên `/profile`: cuối stack, sau `GoogleLinkCard`** — hai card "liên kết tài khoản" (Google, ngân hàng) nằm liền nhau. `PageHead` lead của `/profile` cập nhật liệt kê thêm tài khoản ngân hàng, kèm ý "QR tự đối soát" để giữ ngữ cảnh tính năng ở mọi trạng thái panel (red-team AD-5: lead cũ của `/payments` hiện hiển thị mọi trạng thái — gỡ route mà không giữ ý sẽ mất dòng giải thích duy nhất ở trạng thái linked/inactive). Pin wiring bằng `profile.contract.test.ts` (red-team SA-3).
4. **Không đụng nhánh lỗi OAuth của `/profile`**: `validateSearch ?error=` và effect toast/navigate replace (profile.tsx L24-53) không liên quan panel — modal bank dùng postMessage, không thêm search param mới.
5. **Regression net 2 tầng + e2e 404, đúng precedent `/settings` (red-team SA-1):** gỡ `"/payments": true` khỏi `VALID_EXACT_ROUTES`; pin ở matcher test ("rejects random unknown paths") VÀ tầng worker (`worker.test.ts` unknownPaths — precedent #321 đã ship pin cả 2 tầng); thêm `/payments` vào loop unknown-paths của `apps/e2e/specs/404-branded-status.spec.ts` để chứng minh 404 thật ở tầng serve.
6. **Docs: chỉ thêm, không sửa lịch sử.** CHANGELOG thêm entry mới dưới `## 2026-10-07 ### Removed` (gỡ route + nav đúng định nghĩa Removed theo quy ước của file; entry 2026-10-06 của #320 giữ nguyên); runbook production smoke step đổi tham chiếu trang `/payments` → `/profile`.

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
- [ ] `/payments` hết tồn tại: không còn file route, `routeTree.gen.ts` không còn route (regen bằng tool + verify `grep -c payments` = 0, không sửa tay), `isValidAppRoute("/payments") === false` (matcher test + worker test), `404-branded-status.spec.ts` assert HTTP 404 cho `/payments`, sidebar không còn mục "Nhận học phí".
- [ ] E2E `tuition-bank-transfer.spec.ts` (goto `/profile`), `profile.spec.ts` (nhánh `?error=` OAuth không vỡ) và full suite `pnpm --filter e2e e2e` pass.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test` pass (thứ tự: check-types trước test để drift guard có `routeTree.gen.ts` để đọc).
- [ ] UI verify 3 viewport (1440×900, 768×1024, 375×812) theo REVIEW.md + token theo DESIGN.md, screenshot kèm PR.
- [ ] CHANGELOG (entry mới 2026-10-07, nhóm `### Removed`) và `docs/production-release-runbook.md` (smoke step) cập nhật theo trang mới.

## Risk

- **Discoverability giảm**: nav "Nhận học phí" là đường vào duy nhất của tính năng; sau move, đường vào duy nhất là avatar → Hồ sơ. Chấp nhận theo yêu cầu; nếu cần, follow-up riêng: CTA từ `/tuition` khi `enabled=false`/`none`.
- **Feature-off trên wire** trả 503 code `BANKHUB_DISABLED` (`apps/server/src/routes/bank-link.ts:125`; `BANK_LINK_DISABLED` chỉ là const client-side, client map theo HTTP status) → panel "Chưa bật". Vì panel dùng `bankLinkQueryOptions` kế thừa `staleTime: Number.POSITIVE_INFINITY` từ kernel query client, request chỉ xảy ra 1 lần trên mount đầu mỗi phiên, các lần mở sau dùng cache. **Trong e2e, panel KHÔNG ở trạng thái "Chưa bật"**: boot API wire fake Bank Hub unconditional (`apps/e2e/src/boot.ts:102,112`) nên `GET /api/bank-link` trả `enabled: true, status: "none"` — `profile.spec.ts` vẫn pass vì không assert panel và không collision locator (Google card dùng "Đã kết nối", panel dùng "Đã liên kết"; button names unique).
- **Auth behavior mới trên `/profile` (red-team SA-4)**: panel là kernel API call đầu tiên của trang → kích hoạt `queryCache.onError` toàn cục (401 → reauth; 403 `STUDENT_ON_TEACHER_APP` → `markRoleBlocked` one-way). Hướng thay đổi an toàn hơn (fail-loud sớm); không "fix" 403 của panel bằng cách nới role gate server.
- **Pre-flight trước merge (red-team SA-2)**: `gh secret list` các environment để xác nhận không có BANKHUB/SEPAY secret được set ở stage nào (tính năng chưa bật ngoài local). Nếu thấy secret set ở production → dừng, hỏi user trước khi merge (quyết định không redirect đã chốt dựa trên "chưa bật").

## Red Team Review

### Session — 2026-10-07
**Reviewers:** Security Adversary + Assumption Destroyer (Light tier, Fact Checker), fresh-context subagents trên worktree `refactor/move-bank-link-to-profile`.
**Findings:** 13 (12 accepted — trong đó 2 modified, 1 rejected-một-phần)
**Severity breakdown:** 1 Critical, 3 High, 9 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Thiếu pin tầng worker + e2e 404 spec (precedent #321 pin 2 tầng) | High | Accept | plan.md SC/D5, phase-01 step mới, phase-02 step mới |
| 2 | Premise "beta tắt mặc định" là trạng thái deployment chưa verify; runbook đã dẫn ops vào `/payments` | High | Accept (modified) — chỉ nhận pre-flight `gh secret list`; KHÔNG re-open quyết định "không redirect" (đã chốt bởi user trong issue 2026-10-07) | plan.md Risk |
| 3 | `profile.contract.test.ts` (precedent #321 từng sửa) không được pin card mới + thứ tự | Medium | Accept | phase-01 step mới |
| 4 | Panel引入 kernel API call đầu tiên trên `/profile` → kích hoạt role-block/reauth; plan tuyên bố "không đổi auth" sai một chi tiết | Medium | Accept | phase-01 Security, plan.md Risk |
| 5 | Plan đụng UI nhưng không tham chiếu DESIGN.md (vi phạm quy ước AGENTS.md) | Medium | Accept | phase-01 Context Links, phase-02 viewport step |
| 6 | Risk e2e sai cơ chế: serial là file-scoped; tuần tự liên file nhờ `workers: 1` | Medium | Accept | phase-02 Risk |
| 7 | Risk sai tên error code trên wire (`BANKHUB_DISABLED`, không phải `BANK_LINK_DISABLED`) + sai tần suất request (`staleTime ∞`) | Medium | Accept | plan.md Risk |
| 8 | Risk statement sai cho môi trường e2e: fake Bank Hub wire unconditional → panel enabled/none, không "Chưa bật" | Critical | Accept | phase-02 Risk, plan.md Risk |
| 9 | `routeTree.gen.ts` regen không được machine-verify; drift guard no-op khi file vắng; vitest không regen | High | Accept | phase-01 step 8 + SC |
| 10 | Security Considerations sai: trạng thái panel là org-scoped (`org_bank_link` theo `orgId`), không phải "của chính user" | Medium | Accept | phase-01 Security |
| 11 | CHANGELOG entry gỡ route/nav đặt sai nhóm `### Changed` theo chính quy ước của file | Medium | Accept | plan.md D6, phase-02 step 5 |
| 12 | Mất copy giải thích tính năng ở trạng thái linked/inactive khi xoá lead `/payments` | Medium | Accept (modified) — giữ ý trong lead mới của `/profile`, không đụng panel file (giữ cam kết "panel giữ nguyên 100%") | phase-01 step 1 |
| 13 | Full e2e suite là tuỳ chọn trong khi develop không có CI | Medium | Accept | phase-02 step 6 + Todo |

**Fact-check tổng:** mọi citation line-level của plan đều VERIFIED (routes-matcher.ts:15, sidebar.tsx:89-103, profile.tsx:69-73, matcher test L94-101, spec L140, runbook L772-773…). FAILED: Security claim "của chính user" (org-scoped), Risk "503 BANK_LINK_DISABLED" (wire code là BANKHUB_DISABLED), "profile.spec vô hại vì Chưa bật" (e2e wire enabled). UNVERIFIED (deployment state): "beta tắt mặc định" → chuyển thành pre-flight check.

### Whole-Plan Consistency Sweep

Sau khi apply findings: Decision 5/6 ↔ Success Criteria ↔ phase-01/phase-02 steps đã đồng bộ (2 tầng pin, e2e 404 spec, nhóm `### Removed`, full e2e bắt buộc, routeTree grep verify, lead kèm ý QR auto-match, pre-flight secret check). Diagram "TRƯỚC/SAU" không đổi ý nghĩa (`/payments` 404 — đúng). Không còn mệnh đề "chưa bật" sai ngữ cảnh trong plan.md lẫn phase-02. Non-Goals giữ nguyên — không finding nào mở rộng scope code (tất cả accepted findings là test pin/docs/wording, trừ lead text thuộc đúng mục "cập nhật lead" đã có trong scope). Không còn mâu thuẫn unresolved.
