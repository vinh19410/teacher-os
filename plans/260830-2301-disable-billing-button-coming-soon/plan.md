---
title: "Disable nút 'Quản lý thanh toán' + nhãn 'Sắp ra mắt' (issue #138)"
description: "Interim fix cho mock UI billing: disable nút dead, gắn nhãn Sắp ra mắt, khóa bằng contract test. Không implement payment gateway."
status: completed
priority: P1
effort: "1h"
tags: [issue-138, ui, billing-interim]
created: 2026-08-30
issue: 138
branch: feat/138-disable-billing-button
---

# Disable nút "Quản lý thanh toán" + nhãn "Sắp ra mắt" (issue #138)

## Overview

Issue #112 (QC P1 "nút Quản lý thanh toán không chạy") được điều tra và xác
nhận **không phải bug**: nút tại `apps/web/src/routes/_auth/settings.tsx:104-106`
là mock UI cho feature billing chưa từng được implement (commit `6a63efd`,
phase 7 UI; toàn repo 0 Stripe/portal/subscription; scaffold `--payments none`).
Issue #138 là tracking enhancement: interim disable nút + nhãn "Sắp ra mắt"
ngay trong phase pilot, wire billing portal thật khi mở lại scope monetization.

Plan này chỉ làm phần interim: **PR nhỏ 2 file** (1 route + 1 contract test),
TDD — test khóa trạng thái disabled viết trước, implementation sau.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Nút "Quản lý thanh toán" disabled trong UI, click không xảy ra gì (không modal/navigation/tab mới) | P1 |
| 2 | Nhãn "Sắp ra mắt" hiển thị cạnh nút để pilot user hiểu đây là placeholder, không phải nút hỏng | P1 |
| 3 | Contract test khóa trạng thái interim (disabled + "Sắp ra mắt") chống regression khi ai "fix" nút bằng cách wire handler giả | P1 |
| 4 | CI xanh theo đúng gate thật của repo: biome check, pnpm test (turbo + ci-workflow + topology-drift), check-types, build | P1 |

## Non-goals

- KHÔNG implement payment gateway / billing portal / data model
  plan/subscription — out-of-scope theo production-readiness plan và quyết định
  pilot-first (advise 19/08, 30/08).
- KHÔNG đụng các dead UI khác trong file (Xuất CSV, Xuất JSON, Xóa tài khoản —
  `settings.tsx:222-239`) — mỗi cái một issue riêng, tránh scope creep.
- KHÔNG đổi badge hardcode "Pro – Đang dùng" (`settings.tsx:85-88`) trong PR này.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| [Phase 1](./phase-01-contract-test-disabled-coming-soon.md) | Contract test trước: khóa trạng thái disabled + Sắp ra mắt | Pending |
| [Phase 2](./phase-02-implement-disable-coming-soon-badge.md) | Implement: disable nút + Badge muted Sắp ra mắt | Pending |

## Acceptance Criteria (từ issue #138)

- [ ] Trên app: click vùng nút → disabled, hiện "Sắp ra mắt", không
      modal/navigation/tab mới
- [ ] `profile.contract.test.ts` phủ trạng thái mới (text card "Gói dịch vụ"
      và `unitPrice` vẫn được khóa như cũ)
- [ ] CI/test xanh sau PR (kể cả contract test)
- [ ] Không có thay đổi nào ngoài `settings.tsx` + `profile.contract.test.ts`

## Success Criteria

- [ ] Contract test mới đỏ trước khi implement (TDD — evidence local output,
      vì PR gộp test+impl trong 1 commit nên CI không thấy trạng thái đỏ),
      xanh sau khi implement
- [ ] Bộ gate CI local xanh: `pnpm exec biome check .`, `pnpm test`,
      `pnpm check-types`, `pnpm build`
- [ ] Diff giới hạn đúng 2 file kế hoạch
- [ ] Issue #138 cập nhật branch/plan/AC trước khi cook; label flow
      `ready to cook` → `in progress` → `ready to ship beta` theo vibe

## Risk Assessment

- **Risk:** Contract test source-parse quá brittle (khóa cả markup chi tiết).
  **Mitigation:** chỉ pin những gì là contract hành vi, và scope mọi
  assertion vào block card "Gói dịch vụ" (xem phase 1): token `disabled`
  đứng độc lập trên attrs của đúng nút chứa text "Quản lý thanh toán",
  text node "Sắp ra mắt" trong cùng card, không onClick/href/to trên nút đó.
- **Risk:** ai đó sau này "bật lại" nút mà quên bỏ nhãn. **Mitigation:** test
  pin cả hai cùng nhau — sửa một cái mà thiếu cái kia thì đỏ.
- **Assumption:** `Button` component hỗ trợ prop `disabled` với style
  `disabled:pointer-events-none disabled:opacity-40` (đã xác nhận trong
  `apps/web/src/components/ui/button.tsx:39`; red-team đã verify
  `ButtonHTMLAttributes` + `{...props}` tại `button.tsx:7,44`). Signal nếu
  sai: typecheck lỗi prop — fallback duy nhất là giữ attribute `disabled`
  trên button thật, KHÔNG BAO GIỜ thay bằng CSS-only.

## Known Debt (ngoài scope PR này, có chủ đích)

- Badge "Pro – Đang dùng" + giá "99.000đ/tháng" hardcode cho mọi user
  (`settings.tsx:85-92`) mâu thuẫn messaging với nhãn "Sắp ra mắt" —
  red-team finding A5. Giữ nguyên theo Non-goals (mỗi dead UI một issue
  riêng); ghi nhận trên issue #138 phần "Scope khi mở lại monetization"
  để khi wire billing thật phải xử lý đồng thời plan/tier thật.
- Test interim được đánh dấu vòng đời ngay trong code (comment INTERIM);
  khi billing portal thật land, describe này phải bị xóa/thay — không nới
  lỏng assertion.

## Teardown

- Khi mở lại scope monetization (issue #138, mục "Scope khi mở lại
  monetization"): xóa describe `billing button (interim — issue #138)` trong
  `profile.contract.test.ts`, wire nút theo flow thật. Test được thiết kế
  đỏ đúng lúc đó — đó là tín hiệu đúng, không phải regression.

## References

- Source issue: https://github.com/vinh19410/teacher-os/issues/138
- Investigation report: `plans/reports/advise-2026-08-30-issue112-billing-button-bug-or-feature.md` (repo chính)
- Nút dead: `apps/web/src/routes/_auth/settings.tsx:104-106`
- Contract test hiện tại: `apps/web/src/lib/profile.contract.test.ts:109-118` ("shell integration" — khóa `Gói dịch vụ`, `unitPrice`)

## Red Team Review

### Session — 2026-08-30
**Findings:** 9 (9 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 2 High, 7 Medium
**Reviewers:** Security Adversary + Assumption Destroyer (Light tier — Fact
Checker verification role; chạy dưới vibe `--advice`, auto-adjudicated)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Regex `disabled` match substring (`disabled:opacity-40`, `aria-disabled`) và không neo đúng nút billing | High | Accept | Phase 1 (scoped capture + token pattern `(^|\s)disabled(\s|=$)`) |
| 2 | Negative assertion `onClick/href/to=` toàn-file mâu thuẫn test cũ `to="/profile"` (dòng 114) | High | Accept | Phase 1 (scope vào card block) |
| 3 | "CI xanh" thiếu gate thật: `pnpm exec biome check .`, `pnpm test` (turbo + test:ci-workflow + test:topology-drift), `pnpm check-types`, `pnpm build`; e2e workflow riêng | Medium | Accept | plan Goal #4 + Phase 2 step 3 |
| 4 | Pin "Sắp ra mắt" presence-only thoả mãn bằng comment/dead string | Medium | Accept | Phase 1 (text-node pattern `>\s*Sắp ra mắt\s*<` trong card capture) |
| 5 | Contingency "thêm style thủ công" (CSS-only) tự phá contract — pointer-events-none vẫn kích hoạt bằng bàn phím | Medium | Accept | plan Risk Assessment + Phase 2 (fallback = attribute disabled thật) |
| 6 | Messaging mâu thuẫn: card "Pro – Đang dùng" hardcode + giá cạnh nút "Sắp ra mắt" | Medium | Accept (doc-only) | plan "Known Debt" — không đổi UI trong PR này (ngoài scope issue #138; mỗi dead UI một issue riêng) |
| 7 | AC runtime "click không xảy ra gì" không có bước xác minh nào (contract test chỉ khóa source) | Medium | Accept | Phase 2 step 4 (manual QA checklist) |
| 8 | Test interim không có điều kiện teardown — người wire billing thật sau này không biết phải xóa | Medium | Accept | Phase 1 (comment INTERIM) + plan "Teardown" |
| 9 | TDD đỏ-xanh không neo evidence; commit test-only đỏ gây CI noise | Medium | Accept | Phase 1 step 2-3 (evidence local + commit gộp) |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-contract-test-disabled-coming-soon.md,
  phase-02-implement-disable-coming-soon-badge.md
- Decision deltas checked: 9 (danh sách findings trên)
- Reconciled stale references: 3 (fallback CSS-only → attribute-only;
  "biome + typecheck" → bộ gate CI đầy đủ; presence-check "Sắp ra mắt" →
  text-node trong card scope)
- Unresolved contradictions: 0

## Validation Log

### Verification Results
- **Tier:** Light (Fact Checker — 2 phases × 5 claims)
- **Claims checked:** 10
- **Verified:** 10 | **Failed:** 0 | **Unverified:** 0

Claims đã verify (Fact Checker, hai reviewer độc lập):
1. Nút dead tại `settings.tsx:104-106` — VERIFIED
2. `disabled:pointer-events-none disabled:opacity-40` tại `button.tsx:39` — VERIFIED
3. `Button` extends `ButtonHTMLAttributes` + spread `{...props}` (`button.tsx:7,44`) nên nhận prop `disabled` — VERIFIED
4. `Badge` variant `muted` (`badge.tsx:4,11`) + token CSS tồn tại (`packages/ui/src/styles/globals.css:142,145`) — VERIFIED
5. Contract test hiện có `profile.contract.test.ts:109-118`, assertion `to="/profile"` tại dòng 114 — VERIFIED
6. `pnpm --filter web test` hợp lệ (package `web`, script `test: vitest run`) — VERIFIED
7. Commit `6a63efd` tồn tại, thêm settings.tsx phase 7 — VERIFIED
8. Toàn repo 0 Stripe/portal/subscription (grep apps+packages) — VERIFIED
9. Dead UI khác tại `settings.tsx:227-239` — VERIFIED
10. Không e2e spec nào chạm settings/billing (grep `apps/e2e/specs`) — VERIFIED

### Validation Session — 2026-08-30 (auto, vibe --advice)
Chạy autonomous trong pipeline vibe: interview user được thay bằng adjudication
dựa trên source of truth issue #138 + advise report 30/08. Các quyết định:

1. **Vị trí nhãn "Sắp ra mắt"**: Badge muted cạnh nút (không đổi text nút,
   không badge accent) — theo AC issue: "hiện 'Sắp ra mắt'" + nguyên tắc
   placeholder không đọc thành trạng thái active.
2. **Giữ nguyên text nút "Quản lý thanh toán"** —便于 grep/QC nhận diện nút
   quen thuộc; chỉ đổi trạng thái + thêm nhãn.
3. **Scope 2 file cứng** — issue ghi rõ "Disable nút + cập nhật
   profile.contract.test.ts nếu text card thay đổi"; dead UI khác mỗi cái
   một issue (advise report mục What you shouldn't do).
4. **Badge "Pro – Đang dùng" giữ nguyên** nhưng ghi Known Debt — quyết định
   đã chốt ở bước advise (đừng sửa nhiều thứ cùng PR QC).

Không có câu hỏi mở nào cần user quyết trước khi cook.

<!-- slug: disable-billing-button-coming-soon -->
